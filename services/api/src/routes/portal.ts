/**
 * Developer portal API. Hosts sign in with a portal account (routes/auth.ts) and manage their apps:
 * games, API keys, webhook, quiz banks and usage. App routes take the access token as a bearer
 * token (never a cookie), so they have no CSRF surface.
 */
import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { PortalUser } from '../auth/accounts';
import { ALL_GAME_IDS } from '../catalog';
import { createAuth } from '../http/auth';
import { AppContext } from '../http/context';
import { asyncHandler, HttpError, parse } from '../http/errors';
import {
  createApiKey,
  createTenant,
  listApiKeys,
  listTenantsForUser,
  requireMembership,
  revokeApiKey,
  rotateWebhookSecret,
  setGameAccess,
  setWebhook,
  usage,
  validateWebhookUrl,
} from '../services/tenants';
import { deleteQuizBank, getQuizBank, listQuizBanks, quizBankBody, saveQuizBank } from '../services/quizBanks';
import { listResults } from '../services/results';
import { authRoutes } from './auth';

const MAX_APPS_PER_USER = 10;

const appName = z.string().trim().min(2).max(80);
const gameIds = z.array(z.enum(ALL_GAME_IDS as [string, ...string[]])).max(ALL_GAME_IDS.length);

export function portalRoutes(ctx: AppContext, auth: ReturnType<typeof createAuth>): Router {
  const router = Router();
  const isTest = ctx.config.env === 'test';
  const perUser = (windowMs: number, limit: number) =>
    rateLimit({
      windowMs,
      limit,
      skip: () => isTest,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      keyGenerator: (req) => req.headers.authorization ?? ipKeyGenerator(req.ip ?? ''),
      message: { error: 'Too many requests', code: 'rate_limited' },
    });

  // Public values the portal needs.
  router.get('/config', (_req, res) => {
    res.json({ apiBaseUrl: ctx.config.publicBaseUrl });
  });

  // Accounts: sign up, sign in, password and email changes (their own rate limits).
  router.use('/auth', authRoutes(ctx, auth));

  router.use(perUser(60_000, 120), auth.requirePortalUser);

  const user = (res: { locals: Record<string, unknown> }) => res.locals.user as PortalUser;

  /** Load the app and check the signed-in user belongs to it. */
  const member = async (appId: string, userId: string) => {
    const role = await requireMembership(ctx.db, appId, userId);
    return role;
  };

  router.get(
    '/me',
    asyncHandler(async (_req, res) => {
      const u = user(res);
      res.json({ user: u, apps: await listTenantsForUser(ctx.db, u.id) });
    })
  );

  router.post(
    '/apps',
    asyncHandler(async (req, res) => {
      const u = user(res);
      const body = parse(z.object({ name: appName, gameIds: gameIds.optional() }), req.body);
      const owned = await ctx.db
        .selectFrom('sagegames_tenant_members')
        .select((eb) => eb.fn.countAll<number>().as('n'))
        .where('user_id', '=', u.id)
        .where('role', '=', 'owner')
        .executeTakeFirst();
      if (Number(owned?.n ?? 0) >= MAX_APPS_PER_USER) {
        throw new HttpError(409, `You can own at most ${MAX_APPS_PER_USER} apps`, 'too_many_apps');
      }
      const id = await ctx.db
        .transaction()
        .execute((q) => createTenant(q, { name: body.name, ownerUserId: u.id, gameIds: body.gameIds ?? ALL_GAME_IDS }, ctx.now()));
      const app = (await listTenantsForUser(ctx.db, u.id)).find((a) => a.id === id);
      res.status(201).json(app);
    })
  );

  router.get(
    '/apps/:appId',
    asyncHandler(async (req, res) => {
      const u = user(res);
      await member(req.params.appId, u.id);
      const app = (await listTenantsForUser(ctx.db, u.id)).find((a) => a.id === req.params.appId);
      res.json({ ...app, keys: await listApiKeys(ctx.db, req.params.appId) });
    })
  );

  router.patch(
    '/apps/:appId',
    asyncHandler(async (req, res) => {
      const u = user(res);
      await member(req.params.appId, u.id);
      const body = parse(z.object({ name: appName.optional(), gameIds: gameIds.optional() }), req.body);
      await ctx.db.transaction().execute(async (q) => {
        if (body.name) {
          await q.updateTable('sagegames_tenants').set({ name: body.name, updated_at: ctx.now() }).where('id', '=', req.params.appId).execute();
        }
        if (body.gameIds) await setGameAccess(q, req.params.appId, body.gameIds);
      });
      res.json((await listTenantsForUser(ctx.db, u.id)).find((a) => a.id === req.params.appId));
    })
  );

  router.delete(
    '/apps/:appId',
    asyncHandler(async (req, res) => {
      const u = user(res);
      if ((await member(req.params.appId, u.id)) !== 'owner') {
        throw new HttpError(403, 'Only the owner can delete an app', 'forbidden');
      }
      await ctx.db.deleteFrom('sagegames_tenants').where('id', '=', req.params.appId).execute();
      res.status(204).end();
    })
  );

  // ---- API keys ----

  router.get(
    '/apps/:appId/keys',
    asyncHandler(async (req, res) => {
      await member(req.params.appId, user(res).id);
      res.json(await listApiKeys(ctx.db, req.params.appId));
    })
  );

  router.post(
    '/apps/:appId/keys',
    perUser(3600_000, 30),
    asyncHandler(async (req, res) => {
      const u = user(res);
      await member(req.params.appId, u.id);
      const body = parse(z.object({ label: z.string().trim().max(60).default(''), mode: z.enum(['live', 'test']).default('live') }), req.body);
      // The full key is returned exactly once; only its hash is stored.
      res.status(201).json(
        await createApiKey(ctx.db, {
          tenantId: req.params.appId,
          mode: body.mode,
          label: body.label,
          userId: u.id,
          pepper: ctx.config.apiKeyPepper,
        }, ctx.now())
      );
    })
  );

  router.delete(
    '/apps/:appId/keys/:keyId',
    asyncHandler(async (req, res) => {
      await member(req.params.appId, user(res).id);
      await revokeApiKey(ctx.db, req.params.appId, req.params.keyId, ctx.now());
      res.status(204).end();
    })
  );

  // ---- Webhook ----

  router.get(
    '/apps/:appId/webhook',
    asyncHandler(async (req, res) => {
      await member(req.params.appId, user(res).id);
      const row = await ctx.db
        .selectFrom('sagegames_tenants')
        .select(['webhook_url', 'webhook_secret'])
        .where('id', '=', req.params.appId)
        .executeTakeFirst();
      const deliveries = await ctx.db
        .selectFrom('sagegames_webhook_deliveries')
        .select(['id', 'event_type', 'status', 'attempts', 'last_error', 'created_at', 'delivered_at'])
        .where('tenant_id', '=', req.params.appId)
        .orderBy('created_at', 'desc')
        .orderBy('id', 'desc')
        .limit(20)
        .execute();
      res.json({
        url: row?.webhook_url ?? null,
        secret: row?.webhook_secret ?? null,
        recentDeliveries: deliveries.map((d) => ({
          id: String(d.id),
          event: d.event_type,
          status: d.status,
          attempts: d.attempts,
          lastError: d.last_error,
          createdAt: d.created_at.toISOString(),
          deliveredAt: d.delivered_at ? d.delivered_at.toISOString() : null,
        })),
      });
    })
  );

  router.put(
    '/apps/:appId/webhook',
    asyncHandler(async (req, res) => {
      await member(req.params.appId, user(res).id);
      const body = parse(z.object({ url: z.string().max(500).nullable() }), req.body);
      const url = body.url ? validateWebhookUrl(body.url, ctx.config.env === 'production') : null;
      const saved = await setWebhook(ctx.db, req.params.appId, url, ctx.now());
      res.json({ url: saved.webhookUrl, secret: saved.webhookSecret });
    })
  );

  router.post(
    '/apps/:appId/webhook/rotate-secret',
    asyncHandler(async (req, res) => {
      await member(req.params.appId, user(res).id);
      res.json({ secret: await rotateWebhookSecret(ctx.db, req.params.appId, ctx.now()) });
    })
  );

  // ---- Quiz banks (reusable question sets, used with config.bankId) ----

  router.get(
    '/apps/:appId/quiz-banks',
    asyncHandler(async (req, res) => {
      await member(req.params.appId, user(res).id);
      res.json(await listQuizBanks(ctx.db, req.params.appId));
    })
  );

  router.get(
    '/apps/:appId/quiz-banks/:bankId',
    asyncHandler(async (req, res) => {
      await member(req.params.appId, user(res).id);
      res.json(await getQuizBank(ctx.db, req.params.appId, req.params.bankId));
    })
  );

  router.put(
    '/apps/:appId/quiz-banks/:bankId',
    asyncHandler(async (req, res) => {
      const u = user(res);
      await member(req.params.appId, u.id);
      const body = parse(quizBankBody, req.body);
      res.json(await saveQuizBank(ctx.db, req.params.appId, req.params.bankId, body, ctx.now(), u.id));
    })
  );

  router.delete(
    '/apps/:appId/quiz-banks/:bankId',
    asyncHandler(async (req, res) => {
      await member(req.params.appId, user(res).id);
      await deleteQuizBank(ctx.db, req.params.appId, req.params.bankId);
      res.status(204).end();
    })
  );

  // ---- Recent results (overview) ----

  router.get(
    '/apps/:appId/results',
    asyncHandler(async (req, res) => {
      await member(req.params.appId, user(res).id);
      const limit = parse(z.coerce.number().int().min(1).max(50).default(10), req.query.limit);
      res.json(await listResults(ctx.db, req.params.appId, { limit }));
    })
  );

  // ---- Usage ----

  router.get(
    '/apps/:appId/usage',
    asyncHandler(async (req, res) => {
      await member(req.params.appId, user(res).id);
      const days = parse(z.coerce.number().int().min(1).max(90).default(30), req.query.days);
      res.json({ days, daily: await usage(ctx.db, req.params.appId, days, ctx.now()) });
    })
  );

  return router;
}
