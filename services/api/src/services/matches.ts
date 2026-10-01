import crypto from 'crypto';
import { AnyGameRules, MatchPlayerStatus, MatchPlayerToken, MatchStanding, MatchStatus, MatchView } from '@sagegames/types';
import { generateSessionToken, randomId } from '../auth/keys';
import { rulesFor } from '../catalog';
import { Db, forUpdate, json } from '../db/db';
import { SessionRow } from '../http/auth';
import { AppContext, HostAuth } from '../http/context';
import { HttpError } from '../http/errors';
import { enqueueWebhook } from '../webhooks/outbox';
import { judge, recordResult, resolveGame } from './sessions';

export interface MatchRow {
  id: string;
  tenant_id: string;
  game_id: string;
  is_test: boolean;
  context_id: string | null;
  seed: string;
  rules_version: number;
  resolved_config: Record<string, unknown>;
  status: MatchStatus;
  min_players: number;
  max_players: number;
  allow_join: boolean;
  lobby_expires_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
  standings: MatchStanding[] | null;
  created_at: Date;
}

export interface MatchPlayerRow {
  match_id: string;
  external_user_id: string;
  session_id: string;
  display_name: string | null;
  status: MatchPlayerStatus;
  rank: number | null;
  score: number | null;
  finished_ms: number | null;
  joined_at: Date;
}

export interface CreateMatchInput {
  gameId: string;
  players: { externalUserId: string; displayName?: string }[];
  allowJoin?: boolean;
  minPlayers?: number;
  maxPlayers?: number;
  lobbyTimeoutSec?: number;
  contextId?: string;
  config?: Record<string, unknown>;
}

/** Match seats stay valid for the lobby, the longest possible game and a margin. */
function seatExpiry(lobbyExpiresAt: Date, rules: AnyGameRules, config: unknown): Date {
  return new Date(lobbyExpiresAt.getTime() + rules.limits.maxDurationMs(config) + 15 * 60 * 1000);
}

async function addSeat(
  q: Db,
  match: Pick<MatchRow, 'id' | 'tenant_id' | 'is_test' | 'context_id' | 'game_id' | 'seed' | 'rules_version' | 'resolved_config'>,
  player: { externalUserId: string; displayName?: string },
  expiresAt: Date,
  now: Date
): Promise<string> {
  const sessionId = randomId('sess');
  // Placeholder token hash; a real token is minted when the host asks for one.
  await q
    .insertInto('sagegames_game_sessions')
    .values({
      id: sessionId,
      tenant_id: match.tenant_id,
      is_test: match.is_test,
      external_user_id: player.externalUserId,
      display_name: player.displayName ?? null,
      context_id: match.context_id,
      game_id: match.game_id,
      session_token_hash: `unissued_${crypto.randomBytes(16).toString('hex')}`,
      seed: match.seed,
      rules_version: match.rules_version,
      resolved_config: json(match.resolved_config),
      mode: 'match',
      match_id: match.id,
      metadata: json({}),
      expires_at: expiresAt,
      created_at: now,
    })
    .execute();
  await q
    .insertInto('sagegames_match_players')
    .values({ match_id: match.id, external_user_id: player.externalUserId, session_id: sessionId, display_name: player.displayName ?? null, joined_at: now })
    .execute();
  return sessionId;
}

export async function createMatch(ctx: AppContext, host: HostAuth, input: CreateMatchInput): Promise<MatchView> {
  const { gameId, rules, resolved } = await resolveGame(ctx, host, input.gameId, input.config);
  const minPlayers = input.minPlayers ?? 2;
  const maxPlayers = input.maxPlayers ?? Math.max(minPlayers, input.players.length, input.allowJoin ? 8 : 2);
  const unique = new Set(input.players.map((p) => p.externalUserId));
  if (unique.size !== input.players.length) throw new HttpError(400, 'Each player can only be listed once', 'duplicate_player');
  if (input.players.length > maxPlayers) throw new HttpError(400, 'More players than maxPlayers', 'too_many_players');
  if (!input.allowJoin && input.players.length < minPlayers) {
    throw new HttpError(400, `A match needs at least ${minPlayers} players (or allowJoin)`, 'not_enough_players');
  }

  const now = ctx.now();
  const lobbyExpiresAt = new Date(now.getTime() + (input.lobbyTimeoutSec ?? 120) * 1000);
  const match = {
    id: randomId('match', 10),
    tenant_id: host.tenantId,
    is_test: host.isTest,
    context_id: input.contextId ?? null,
    game_id: gameId,
    seed: crypto.randomBytes(16).toString('hex'),
    rules_version: rules.rulesVersion,
    resolved_config: resolved as Record<string, unknown>,
  };
  const expiresAt = seatExpiry(lobbyExpiresAt, rules, resolved);

  await ctx.db.transaction().execute(async (q) => {
    await q
      .insertInto('sagegames_matches')
      .values({
        id: match.id,
        tenant_id: match.tenant_id,
        game_id: match.game_id,
        is_test: match.is_test,
        context_id: match.context_id,
        seed: match.seed,
        rules_version: match.rules_version,
        resolved_config: json(match.resolved_config),
        min_players: minPlayers,
        max_players: maxPlayers,
        allow_join: !!input.allowJoin,
        lobby_expires_at: lobbyExpiresAt,
        created_at: now,
      })
      .execute();
    for (const player of input.players) await addSeat(q, match, player, expiresAt, now);
  });

  return (await getMatchView(ctx.db, host.tenantId, match.id))!;
}

/** Issue (or re-issue) the seat token for a player. Re-issuing invalidates the old token. */
export async function mintPlayerToken(ctx: AppContext, host: HostAuth, matchId: string, externalUserId: string): Promise<MatchPlayerToken> {
  const match = await loadMatch(ctx.db, host.tenantId, matchId);
  if (!match) throw new HttpError(404, 'Match not found', 'match_not_found');
  if (!['lobby', 'countdown', 'in_progress'].includes(match.status)) {
    throw new HttpError(409, `Match is ${match.status}`, 'match_closed');
  }
  const player = await findPlayer(ctx.db, matchId, externalUserId);
  if (!player) throw new HttpError(404, 'This user is not in the match', 'not_a_player');
  const { token, hash } = generateSessionToken();
  await ctx.db.updateTable('sagegames_game_sessions').set({ session_token_hash: hash }).where('id', '=', player.session_id).execute();
  return { matchId, playerId: player.session_id, playerToken: token };
}

/** Add a player to an open lobby (group matches) and issue their token. */
export async function joinMatch(
  ctx: AppContext,
  host: HostAuth,
  matchId: string,
  player: { externalUserId: string; displayName?: string }
): Promise<{ token: MatchPlayerToken; added: MatchPlayerRow | null }> {
  const added = await ctx.db.transaction().execute(async (q) => {
    const match = (await forUpdate(
      q,
      q.selectFrom('sagegames_matches').selectAll().where('id', '=', matchId).where('tenant_id', '=', host.tenantId)
    ).executeTakeFirst()) as MatchRow | undefined;
    if (!match) throw new HttpError(404, 'Match not found', 'match_not_found');
    const existing = await findPlayer(q, matchId, player.externalUserId);
    if (existing) return null; // already seated: just issue a token
    if (match.status !== 'lobby') throw new HttpError(409, 'The match has already started', 'match_started');
    if (!match.allow_join) throw new HttpError(403, 'This match is invite-only', 'invite_only');
    const count = await q
      .selectFrom('sagegames_match_players')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('match_id', '=', matchId)
      .executeTakeFirst();
    if (Number(count?.n ?? 0) >= match.max_players) throw new HttpError(409, 'The match is full', 'match_full');

    const rules = rulesFor(match.game_id)!;
    await addSeat(q, match, player, seatExpiry(match.lobby_expires_at, rules, match.resolved_config), ctx.now());
    return findPlayer(q, matchId, player.externalUserId);
  });
  return { token: await mintPlayerToken(ctx, host, matchId, player.externalUserId), added };
}

async function findPlayer(q: Db, matchId: string, externalUserId: string): Promise<MatchPlayerRow | null> {
  const row = await q
    .selectFrom('sagegames_match_players')
    .selectAll()
    .where('match_id', '=', matchId)
    .where('external_user_id', '=', externalUserId)
    .executeTakeFirst();
  return row ?? null;
}

export async function loadMatch(q: Db, tenantId: string | null, matchId: string): Promise<MatchRow | null> {
  let query = q.selectFrom('sagegames_matches').selectAll().where('id', '=', matchId);
  if (tenantId) query = query.where('tenant_id', '=', tenantId);
  return ((await query.executeTakeFirst()) as MatchRow | undefined) ?? null;
}

export async function loadPlayers(q: Db, matchId: string): Promise<MatchPlayerRow[]> {
  return q
    .selectFrom('sagegames_match_players')
    .selectAll()
    .where('match_id', '=', matchId)
    .orderBy('joined_at')
    .orderBy('external_user_id')
    .execute();
}

export function toView(match: MatchRow, players: MatchPlayerRow[], live?: Map<string, { connected: boolean; progress: number; score: number }>): MatchView {
  return {
    matchId: match.id,
    gameId: match.game_id,
    status: match.status,
    contextId: match.context_id,
    minPlayers: match.min_players,
    maxPlayers: match.max_players,
    allowJoin: match.allow_join,
    lobbyExpiresAt: match.lobby_expires_at.toISOString(),
    startAt: match.started_at ? match.started_at.getTime() : null,
    standings: match.standings,
    players: players.map((p) => ({
      playerId: p.session_id,
      externalUserId: p.external_user_id,
      displayName: p.display_name,
      status: p.status,
      connected: live?.get(p.session_id)?.connected ?? false,
      progress: live?.get(p.session_id)?.progress ?? (p.status === 'finished' ? 1 : 0),
      score: live?.get(p.session_id)?.score ?? p.score ?? 0,
      finishedMs: p.finished_ms,
    })),
  };
}

export async function getMatchView(db: Db, tenantId: string, matchId: string): Promise<MatchView | null> {
  const match = await loadMatch(db, tenantId, matchId);
  if (!match) return null;
  return toView(match, await loadPlayers(db, matchId));
}

/** Persist status changes made by the live room (fire-and-forget from the room's point of view). */
export async function saveMatchStatus(db: Db, matchId: string, status: MatchStatus, startedAt?: Date): Promise<void> {
  await db
    .updateTable('sagegames_matches')
    .set(startedAt ? { status, started_at: startedAt } : { status })
    .where('id', '=', matchId)
    .execute();
}

export async function savePlayerStatus(db: Db, matchId: string, sessionId: string, status: MatchPlayerStatus): Promise<void> {
  await db.updateTable('sagegames_match_players').set({ status }).where('match_id', '=', matchId).where('session_id', '=', sessionId).execute();
}

export interface FinalPlayer {
  sessionId: string;
  status: MatchPlayerStatus;
  log: unknown | null;
  finishedMs: number | null;
}

/**
 * Store every participant's verified result, the final standings and queue match.finished.
 * One transaction, so a match is either fully recorded or not at all.
 */
export async function finalizeMatch(
  db: Db,
  matchId: string,
  standings: MatchStanding[],
  players: FinalPlayer[],
  elapsedMs: number,
  now: Date
): Promise<void> {
  await db.transaction().execute(async (q) => {
    const match = await forUpdate(q, q.selectFrom('sagegames_matches').selectAll().where('id', '=', matchId)).executeTakeFirst();
    if (!match || match.status === 'finished') return;

    for (const p of players) {
      const standing = standings.find((s) => s.playerId === p.sessionId);
      await q
        .updateTable('sagegames_match_players')
        .set({ status: p.status, rank: standing?.rank ?? null, score: standing?.score ?? null, finished_ms: p.finishedMs })
        .where('match_id', '=', matchId)
        .where('session_id', '=', p.sessionId)
        .execute();
      if (p.log === null) continue; // absent players have nothing to record
      const session = await forUpdate(q, q.selectFrom('sagegames_game_sessions').selectAll().where('id', '=', p.sessionId)).executeTakeFirst();
      if (!session || session.status === 'completed') continue;
      // Replay what the server applied live, to store the result exactly like a solo game.
      await recordResult(q, session, p.log, judge(session, p.log, elapsedMs + 5000), now);
    }

    await q
      .updateTable('sagegames_matches')
      .set({ status: 'finished', finished_at: now, standings: json(standings) })
      .where('id', '=', matchId)
      .execute();
    if (!match.is_test) {
      await enqueueWebhook(q, match.tenant_id, 'match.finished', {
        matchId,
        gameId: match.game_id,
        contextId: match.context_id,
        standings,
        finishedAt: now.toISOString(),
      }, now);
    }
  });
}

/** Matches cut off by a restart can't resume (their live state was in memory). */
export async function abortStaleMatches(db: Db, now: Date): Promise<number> {
  const result = await db
    .updateTable('sagegames_matches')
    .set({ status: 'aborted', finished_at: now })
    .where('status', 'in', ['countdown', 'in_progress'])
    .executeTakeFirst();
  return Number(result.numUpdatedRows);
}
