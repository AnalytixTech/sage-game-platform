import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { quizMasterRules } from '@sagegames/game-quiz-master';
import { ConfigError } from '@sagegames/engine';
import { one } from '../db/db';
import { createAuth, SessionRow } from '../http/auth';
import { AppContext, HostAuth } from '../http/context';
import { asyncHandler, HttpError, parse } from '../http/errors';
import { leaderboard, playerStats } from '../services/leaderboards';
import { catalogHandlers } from './catalogHandlers';
import { COMPLETE_GRACE_MS, completeSession, createSession, loadCompletion, playPayload, startSession } from '../services/sessions';

const id = z.string().trim().min(1).max(128);
const jsonObject = z.record(z.string(), z.unknown());

const createSessionBody = z.object({
  gameId: z.string().trim().min(1).max(64),
  externalUserId: id,
  displayName: z.string().trim().max(64).optional(),
  contextId: id.optional(),
  config: jsonObject.optional(),
  metadata: jsonObject.optional(),
});

const boardQuery = z.object({
  period: z.enum(['all_time', 'daily', 'weekly', 'monthly']).optional(),
  contextId: id.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

export function v2Routes(ctx: AppContext, auth: ReturnType<typeof createAuth>): Router {
  const router = Router();
  const isTest = ctx.config.env === 'test';
  const limiter = (max: number, keyFrom?: (token: string | undefined, ip: string) => string) =>
    rateLimit({
      windowMs: 60_000,
      limit: max,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skip: () => isTest,
      keyGenerator: keyFrom ? (req) => keyFrom(req.headers.authorization, ipKeyGenerator(req.ip ?? '')) : undefined,
      message: { error: 'Too many requests', code: 'rate_limited' },
    });
  const hostLimit = limiter(600, (auth, ip) => auth ?? ip);
  const playerLimit = limiter(120);
  const completeLimit = limiter(30);

  // ---- Catalog (public; narrowed to the app's games when a host key is sent) ----

  const catalog = catalogHandlers(ctx);
  router.get('/games', auth.optionalHost, catalog.list);
  router.get('/games/:gameId', catalog.get);

  // ---- Host (server-to-server, API key) ----

  router.post(
    '/sessions',
    hostLimit,
    auth.requireHost,
    asyncHandler(async (req, res) => {
      const body = parse(createSessionBody, req.body);
      res.status(201).json(await createSession(ctx, res.locals.host, body));
    })
  );

  router.get(
    '/sessions/:sessionId',
    hostLimit,
    auth.requireHost,
    asyncHandler(async (req, res) => {
      const host: HostAuth = res.locals.host;
      const s = await one<SessionRow>(ctx.db, 'SELECT * FROM game_sessions WHERE id = $1 AND tenant_id = $2', [
        req.params.sessionId,
        host.tenantId,
      ]);
      if (!s) throw new HttpError(404, 'Session not found', 'session_not_found');
      const result = s.status === 'completed' ? await loadCompletion(ctx.db, s.id) : null;
      res.json({
        id: s.id,
        gameId: s.game_id,
        externalUserId: s.external_user_id,
        displayName: s.display_name,
        contextId: s.context_id,
        status: s.status,
        isTest: s.is_test,
        metadata: s.metadata,
        expiresAt: new Date(s.expires_at).toISOString(),
        startedAt: s.started_at ? new Date(s.started_at).toISOString() : null,
        completedAt: s.completed_at ? new Date(s.completed_at).toISOString() : null,
        result,
      });
    })
  );

  router.get(
    '/results',
    hostLimit,
    auth.requireHost,
    asyncHandler(async (req, res) => {
      const query = parse(
        z.object({
          externalUserId: id.optional(),
          gameId: id.optional(),
          contextId: id.optional(),
          since: z.coerce.date().optional(),
          limit: z.coerce.number().int().min(1).max(200).default(50),
        }),
        req.query
      );
      const rows = await ctx.db.query<Record<string, unknown>>(
        `SELECT session_id, game_id, external_user_id, display_name, context_id, status, reject_code, score,
                duration_ms, result, flags, is_valid, is_test, completed_at
           FROM game_results
          WHERE tenant_id = $1
            AND ($2::text IS NULL OR external_user_id = $2)
            AND ($3::text IS NULL OR game_id = $3)
            AND ($4::text IS NULL OR context_id = $4)
            AND ($5::timestamptz IS NULL OR completed_at >= $5)
          ORDER BY completed_at DESC
          LIMIT $6`,
        [
          (res.locals.host as HostAuth).tenantId,
          query.externalUserId ?? null,
          query.gameId ?? null,
          query.contextId ?? null,
          query.since ?? null,
          query.limit,
        ]
      );
      res.json(
        rows.map((r) => ({
          sessionId: r.session_id,
          gameId: r.game_id,
          externalUserId: r.external_user_id,
          displayName: r.display_name,
          contextId: r.context_id,
          status: r.status,
          rejectCode: r.reject_code,
          valid: r.is_valid,
          isTest: r.is_test,
          score: r.score,
          durationMs: r.duration_ms,
          result: r.result,
          flags: r.flags,
          completedAt: new Date(r.completed_at as Date).toISOString(),
        }))
      );
    })
  );

  router.get(
    '/leaderboards/:gameId',
    hostLimit,
    auth.requireHost,
    asyncHandler(async (req, res) => {
      const query = parse(boardQuery, req.query);
      const host: HostAuth = res.locals.host;
      res.json(
        await leaderboard(
          ctx.db,
          { tenantId: host.tenantId, gameId: req.params.gameId, period: query.period, contextId: query.contextId },
          query,
          ctx.now()
        )
      );
    })
  );

  router.get(
    '/users/:externalUserId/stats',
    hostLimit,
    auth.requireHost,
    asyncHandler(async (req, res) => {
      res.json(await playerStats(ctx.db, (res.locals.host as HostAuth).tenantId, req.params.externalUserId));
    })
  );

  // ---- Quiz banks (host) ----

  router.get(
    '/quiz-banks',
    hostLimit,
    auth.requireHost,
    asyncHandler(async (_req, res) => {
      const rows = await ctx.db.query<{ bank_id: string; name: string; count: number; updated_at: Date }>(
        `SELECT bank_id, name, jsonb_array_length(questions)::int AS count, updated_at
           FROM quiz_banks WHERE tenant_id = $1 ORDER BY bank_id`,
        [(res.locals.host as HostAuth).tenantId]
      );
      res.json(rows.map((r) => ({ bankId: r.bank_id, name: r.name, questionCount: r.count, updatedAt: new Date(r.updated_at).toISOString() })));
    })
  );

  router.get(
    '/quiz-banks/:bankId',
    hostLimit,
    auth.requireHost,
    asyncHandler(async (req, res) => {
      const row = await one<{ bank_id: string; name: string; questions: unknown }>(
        ctx.db,
        'SELECT bank_id, name, questions FROM quiz_banks WHERE tenant_id = $1 AND bank_id = $2',
        [(res.locals.host as HostAuth).tenantId, req.params.bankId]
      );
      if (!row) throw new HttpError(404, 'Quiz bank not found', 'quiz_bank_not_found');
      res.json({ bankId: row.bank_id, name: row.name, questions: row.questions });
    })
  );

  router.put(
    '/quiz-banks/:bankId',
    hostLimit,
    auth.requireHost,
    asyncHandler(async (req, res) => {
      const bankId = parse(z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/), req.params.bankId);
      const body = parse(z.object({ name: z.string().max(120).optional(), questions: z.array(z.unknown()).min(1) }), req.body);
      let questions: unknown;
      try {
        questions = quizMasterRules.parseConfig({ questions: body.questions }).questions;
      } catch (err) {
        if (err instanceof ConfigError) throw new HttpError(400, err.message, 'invalid_questions');
        throw err;
      }
      await ctx.db.query(
        `INSERT INTO quiz_banks (tenant_id, bank_id, name, questions, updated_at) VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (tenant_id, bank_id) DO UPDATE SET name = EXCLUDED.name, questions = EXCLUDED.questions, updated_at = now()`,
        [(res.locals.host as HostAuth).tenantId, bankId, body.name ?? '', JSON.stringify(questions)]
      );
      res.json({ bankId, name: body.name ?? '', questionCount: (questions as unknown[]).length });
    })
  );

  router.delete(
    '/quiz-banks/:bankId',
    hostLimit,
    auth.requireHost,
    asyncHandler(async (req, res) => {
      await ctx.db.query('DELETE FROM quiz_banks WHERE tenant_id = $1 AND bank_id = $2', [
        (res.locals.host as HostAuth).tenantId,
        req.params.bankId,
      ]);
      res.status(204).end();
    })
  );

  // ---- Player (session token) ----

  router.get(
    '/sessions/:sessionId/play',
    playerLimit,
    auth.requireSession(),
    asyncHandler(async (_req, res) => {
      res.json(playPayload(ctx, res.locals.session));
    })
  );

  router.post(
    '/sessions/:sessionId/start',
    playerLimit,
    auth.requireSession(),
    asyncHandler(async (req, res) => {
      const body = parse(z.object({ rulesVersion: z.number().int().positive().optional() }), req.body ?? {});
      res.json(await startSession(ctx, res.locals.session, body.rulesVersion));
    })
  );

  router.post(
    '/sessions/:sessionId/complete',
    completeLimit,
    auth.requireSession(COMPLETE_GRACE_MS),
    asyncHandler(async (req, res) => {
      const body = parse(z.object({ log: z.unknown() }), req.body);
      const outcome = await completeSession(ctx, (res.locals.session as SessionRow).id, body.log);
      res.status(outcome.status === 'rejected' ? 422 : 200).json(outcome);
    })
  );

  router.get(
    '/sessions/:sessionId/leaderboard',
    playerLimit,
    auth.requireSession(COMPLETE_GRACE_MS),
    asyncHandler(async (req, res) => {
      const s: SessionRow = res.locals.session;
      const query = parse(boardQuery.extend({ scope: z.enum(['context', 'game']).default('context') }), req.query);
      const contextId = query.scope === 'context' ? s.context_id : null;
      res.json(
        await leaderboard(ctx.db, { tenantId: s.tenant_id, gameId: s.game_id, period: query.period, contextId }, query, ctx.now())
      );
    })
  );

  return router;
}
