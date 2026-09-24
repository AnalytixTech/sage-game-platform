import { Router } from 'express';
import { z } from 'zod';
import { createAuth } from '../http/auth';
import { AppContext, HostAuth } from '../http/context';
import { asyncHandler, HttpError, parse } from '../http/errors';
import { MatchHub } from '../realtime/MatchRoom';
import { createMatch, getMatchView, joinMatch, mintPlayerToken } from '../services/matches';

const id = z.string().trim().min(1).max(128);
const player = z.object({ externalUserId: id, displayName: z.string().trim().max(64).optional() });

/** Host (API key) endpoints for online battles. Players connect to /v2/ws with their seat token. */
export function matchRoutes(ctx: AppContext, auth: ReturnType<typeof createAuth>, hub: MatchHub): Router {
  const router = Router();
  router.use(auth.requireHost);
  const host = (res: { locals: Record<string, unknown> }) => res.locals.host as HostAuth;

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const body = parse(
        z.object({
          gameId: z.string().trim().min(1).max(64),
          players: z.array(player).max(16).default([]),
          allowJoin: z.boolean().optional(),
          minPlayers: z.number().int().min(2).max(16).optional(),
          maxPlayers: z.number().int().min(2).max(16).optional(),
          lobbyTimeoutSec: z.number().int().min(15).max(600).optional(),
          contextId: id.optional(),
          config: z.record(z.string(), z.unknown()).optional(),
        }),
        req.body
      );
      if (body.minPlayers && body.maxPlayers && body.minPlayers > body.maxPlayers) {
        throw new HttpError(400, 'minPlayers cannot exceed maxPlayers', 'invalid_request');
      }
      res.status(201).json(await createMatch(ctx, host(res), body));
    })
  );

  router.get(
    '/:matchId',
    asyncHandler(async (req, res) => {
      const stored = await getMatchView(ctx.db, host(res).tenantId, req.params.matchId);
      if (!stored) throw new HttpError(404, 'Match not found', 'match_not_found');
      // A live room knows connections, progress and scores; fall back to what's stored.
      const live = await hub.loadedRoom(req.params.matchId);
      res.json(live ? live.view() : stored);
    })
  );

  router.post(
    '/:matchId/tokens',
    asyncHandler(async (req, res) => {
      const body = parse(z.object({ externalUserId: id }), req.body);
      res.status(201).json(await mintPlayerToken(ctx, host(res), req.params.matchId, body.externalUserId));
    })
  );

  router.post(
    '/:matchId/players',
    asyncHandler(async (req, res) => {
      const body = parse(player, req.body);
      const { token, added } = await joinMatch(ctx, host(res), req.params.matchId, body);
      if (added) (await hub.loadedRoom(req.params.matchId))?.addPlayer(added);
      res.status(201).json(token);
    })
  );

  return router;
}
