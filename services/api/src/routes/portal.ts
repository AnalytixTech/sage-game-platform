/**
 * Developer portal API. Hosts sign in with Supabase Auth (email + password, confirmed email) and
 * manage their apps: games, API keys, webhook and usage. Every request carries the Supabase access
 * token as a bearer token; there are no cookies, so no CSRF surface.
 */
import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { PortalUser } from '../auth/portalAuth';
import { ALL_GAME_IDS } from '../catalog';
import { one } from '../db/db';
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

  // Public values the portal needs to talk to Supabase Auth (the anon key is designed to be public).
  router.get('/config', (_req, res) => {
    res.json({ supabaseUrl: ctx.config.supabaseUrl, supabaseAnonKey: ctx.config.supabaseAnonKey, apiBaseUrl: ctx.config.publicBaseUrl });
  });

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
      const owned = await one<{ n: number }>(
        ctx.db,
        `SELECT COUNT(*)::int AS n FROM tenant_members WHERE user_id = $1 AND role = 'owner'`,
        [u.id]
      );
      if ((owned?.n ?? 0) >= MAX_APPS_PER_USER) {
        throw new HttpError(409, `You can own at most ${MAX_APPS_PER_USER} apps`, 'too_many_apps');
      }
      const id = await ctx.db.tx((q) =>
        createTenant(q, { name: body.name, ownerUserId: u.id, gameIds: body.gameIds ?? ALL_GAME_IDS })
      );
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
      await ctx.db.tx(async (q) => {
        if (body.name) await q.query('UPDATE tenants SET name = $2, updated_at = now() WHERE id = $1', [req.params.appId, body.name]);
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
      await ctx.db.query('DELETE FROM tenants WHERE id = $1', [req.params.appId]);
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
        })
      );
    })
  );

  router.delete(
    '/apps/:appId/keys/:keyId',
    asyncHandler(async (req, res) => {
      await member(req.params.appId, user(res).id);
      await revokeApiKey(ctx.db, req.params.appId, req.params.keyId);
      res.status(204).end();
    })
  );

  // ---- Webhook ----

  router.get(
    '/apps/:appId/webhook',
    asyncHandler(async (req, res) => {
      await member(req.params.appId, user(res).id);
      const row = await one<{ webhook_url: string | null; webhook_secret: string | null }>(
        ctx.db,
        'SELECT webhook_url, webhook_secret FROM tenants WHERE id = $1',
        [req.params.appId]
      );
      const deliveries = await ctx.db.query<Record<string, unknown>>(
        `SELECT id, event_type, status, attempts, last_error, created_at, delivered_at
           FROM webhook_deliveries WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [req.params.appId]
      );
      res.json({
        url: row?.webhook_url ?? null,
        secret: row?.webhook_secret ?? null,
        recentDeliveries: deliveries.map((d) => ({
          id: String(d.id),
          event: d.event_type,
          status: d.status,
          attempts: d.attempts,
          lastError: d.last_error,
          createdAt: new Date(d.created_at as Date).toISOString(),
          deliveredAt: d.delivered_at ? new Date(d.delivered_at as Date).toISOString() : null,
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
      const saved = await setWebhook(ctx.db, req.params.appId, url);
      res.json({ url: saved.webhookUrl, secret: saved.webhookSecret });
    })
  );

  router.post(
    '/apps/:appId/webhook/rotate-secret',
    asyncHandler(async (req, res) => {
      await member(req.params.appId, user(res).id);
      res.json({ secret: await rotateWebhookSecret(ctx.db, req.params.appId) });
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
      await member(req.params.appId, user(res).id);
      const body = parse(quizBankBody, req.body);
      res.json(await saveQuizBank(ctx.db, req.params.appId, req.params.bankId, body, ctx.now()));
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
