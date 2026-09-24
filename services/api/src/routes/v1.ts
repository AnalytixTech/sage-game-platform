/**
 * v1 compatibility layer for SDK 1.x hosts (e.g. the current Japabudz build).
 * Backed by the same database as v2. Client-reported v1 scores cannot be verified, so they are
 * stored as 'unverified' and never reach leaderboards. New integrations should use /v2.
 */
import { Router } from 'express';
import { z } from 'zod';
import { randomId } from '../auth/keys';
import { one } from '../db/db';
import { bearerToken, createAuth, SessionRow } from '../http/auth';
import { AppContext, HostAuth } from '../http/context';
import { asyncHandler, HttpError, parse } from '../http/errors';
import { leaderboard, playerStats } from '../services/leaderboards';
import { createSession, startSession } from '../services/sessions';
import { catalogHandlers } from './catalogHandlers';

export function v1Routes(ctx: AppContext, auth: ReturnType<typeof createAuth>): Router {
  const router = Router();
  const catalog = catalogHandlers(ctx);

  router.use((_req, res, next) => {
    res.setHeader('Deprecation', 'true');
    res.setHeader('Link', '</v2>; rel="successor-version"');
    next();
  });

  router.get('/games', auth.optionalHost, catalog.list);
  router.get('/games/:gameId', catalog.get);

  router.post(
    '/sessions',
    auth.requireHost,
    asyncHandler(async (req, res) => {
      const body = parse(
        z.object({
          gameId: z.string().trim().min(1).max(64),
          externalUserId: z.string().trim().min(1).max(128),
          metadata: z.record(z.string(), z.unknown()).optional(),
          configOverride: z.record(z.string(), z.unknown()).optional(),
        }),
        req.body
      );
      const name = body.metadata?.name;
      const created = await createSession(ctx, res.locals.host, {
        gameId: body.gameId,
        externalUserId: body.externalUserId,
        displayName: typeof name === 'string' ? name.slice(0, 64) : undefined,
        config: body.configOverride,
        metadata: body.metadata,
      });
      res.status(201).json(created);
    })
  );

  const toV1 = (s: SessionRow, includeMetadata: boolean) => ({
    id: s.id,
    tenantId: s.tenant_id,
    externalUserId: s.external_user_id,
    gameId: s.game_id,
    status: s.status,
    expiresAt: new Date(s.expires_at).toISOString(),
    startedAt: s.started_at ? new Date(s.started_at).toISOString() : undefined,
    completedAt: s.completed_at ? new Date(s.completed_at).toISOString() : undefined,
    ...(includeMetadata ? { metadata: s.metadata } : {}),
  });

  router.get(
    '/sessions/:sessionId',
    asyncHandler(async (req, res, next) => {
      // Host key (with metadata) or the session's own token (without).
      const token = bearerToken(req);
      const host = token ? await auth.resolveHostKey(token) : null;
      if (!host) {
        return auth.requireSession()(req, res, (err?: unknown) =>
          err ? next(err) : res.json(toV1(res.locals.session, false))
        );
      }
      const s = await one<SessionRow>(ctx.db, 'SELECT * FROM game_sessions WHERE id = $1 AND tenant_id = $2', [
        req.params.sessionId,
        host.tenantId,
      ]);
      if (!s) return next(new HttpError(404, 'Session not found', 'session_not_found'));
      res.json(toV1(s, true));
    })
  );

  router.post(
    '/sessions/:sessionId/start',
    auth.requireSession(),
    asyncHandler(async (_req, res) => {
      await startSession(ctx, res.locals.session);
      const s = await one<SessionRow>(ctx.db, 'SELECT * FROM game_sessions WHERE id = $1', [res.locals.session.id]);
      res.json(toV1(s as SessionRow, false));
    })
  );

  const transition = (from: SessionRow['status'], to: SessionRow['status']) =>
    asyncHandler(async (_req, res) => {
      const s: SessionRow = res.locals.session;
      const [row] = await ctx.db.query<SessionRow>(
        'UPDATE game_sessions SET status = $3 WHERE id = $1 AND status = $2 RETURNING *',
        [s.id, from, to]
      );
      if (!row) throw new HttpError(409, `Cannot move session from '${s.status}' to '${to}'`, 'invalid_status');
      res.json(toV1(row, false));
    });

  router.post('/sessions/:sessionId/pause', auth.requireSession(), transition('active', 'paused'));
  router.post('/sessions/:sessionId/resume', auth.requireSession(), transition('paused', 'active'));
  router.post('/sessions/:sessionId/events', auth.requireSession(), (_req, res) => {
    res.json({ success: true, timestamp: ctx.now().toISOString() });
  });

  router.post(
    '/sessions/:sessionId/complete',
    auth.requireSession(),
    asyncHandler(async (req, res) => {
      const body = parse(
        z.object({ score: z.number().min(0), duration: z.number().min(0), data: z.record(z.string(), z.unknown()).optional() }),
        req.body
      );
      const s: SessionRow = res.locals.session;
      const now = ctx.now();
      const elapsedSec = s.started_at ? (now.getTime() - new Date(s.started_at).getTime()) / 1000 : 0;
      if (body.duration > elapsedSec + 5) {
        throw new HttpError(422, 'duration exceeds the time since the session started', 'duration_exceeds_elapsed');
      }

      await ctx.db.tx(async (q) => {
        const [row] = await q.query(
          `UPDATE game_sessions SET status = 'completed', completed_at = $2
            WHERE id = $1 AND status IN ('active', 'paused') RETURNING id`,
          [s.id, now]
        );
        if (!row) throw new HttpError(409, `Session cannot be completed from status '${s.status}'`, 'invalid_status');
        await q.query(
          `INSERT INTO game_results
             (id, session_id, tenant_id, game_id, external_user_id, display_name, context_id, status, score,
              duration_ms, result, flags, is_valid, is_test, rules_version, completed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'unverified', $8, $9, $10, '["unverified_v1"]', FALSE, $11, $12, $13)`,
          [
            randomId('res'),
            s.id,
            s.tenant_id,
            s.game_id,
            s.external_user_id,
            s.display_name,
            s.context_id,
            Math.min(Math.floor(body.score), 100_000),
            Math.floor(body.duration * 1000),
            JSON.stringify(body.data ?? {}),
            s.is_test,
            s.rules_version,
            now,
          ]
        );
      });

      res.json({
        sessionId: s.id,
        gameId: s.game_id,
        externalUserId: s.external_user_id,
        score: Math.min(Math.floor(body.score), 100_000),
        duration: Math.floor(body.duration),
        completedAt: now.toISOString(),
        data: body.data ?? {},
      });
    })
  );

  router.get(
    '/games/:gameId/leaderboard',
    auth.requireHost,
    asyncHandler(async (req, res) => {
      const q = parse(
        z.object({
          period: z.enum(['all_time', 'daily', 'weekly', 'monthly']).optional(),
          limit: z.coerce.number().int().min(1).max(100).default(50),
          offset: z.coerce.number().int().min(0).max(10_000).default(0),
        }),
        req.query
      );
      const host: HostAuth = res.locals.host;
      res.json(await leaderboard(ctx.db, { tenantId: host.tenantId, gameId: req.params.gameId, period: q.period }, q, ctx.now()));
    })
  );

  router.get(
    '/users/:externalUserId/stats',
    auth.requireHost,
    asyncHandler(async (req, res) => {
      res.json(await playerStats(ctx.db, (res.locals.host as HostAuth).tenantId, req.params.externalUserId));
    })
  );

  return router;
}
