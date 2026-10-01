import crypto from 'crypto';
import { ConfigError, replay, ReplayRejected } from '@sagegames/engine';
import { generateSessionToken, randomId, sha256Hex } from '../auth/keys';
import { rulesFor } from '../catalog';
import { sql } from 'kysely';
import { Db, forUpdate, greatest, json, onConflictUpdate } from '../db/db';
import { SessionRow } from '../http/auth';
import { AppContext, HostAuth } from '../http/context';
import { HttpError } from '../http/errors';
import { enqueueWebhook } from '../webhooks/outbox';
import { rankFor } from './leaderboards';

export const SESSION_TTL_MS = 60 * 60 * 1000;
/** A game that ends right at expiry can still submit its log for this long. */
export const COMPLETE_GRACE_MS = 10 * 60 * 1000;

export interface CreateSessionInput {
  gameId: string;
  externalUserId: string;
  displayName?: string;
  contextId?: string;
  config?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface CreatedSession {
  sessionId: string;
  sessionToken: string;
  gameId: string;
  expiresAt: string;
  rulesVersion: number;
}

const QUIZ_GAME_ID = 'game_quiz_001';

/** Check the app may use the game and validate its config (tenant defaults + request config). */
export async function resolveGame(ctx: AppContext, host: HostAuth, gameIdOrSlug: string, config: Record<string, unknown> | undefined) {
  const game = await ctx.db
    .selectFrom('sagegames_games as g')
    .leftJoin('sagegames_tenant_game_access as a', (join) => join.onRef('a.game_id', '=', 'g.id').on('a.tenant_id', '=', host.tenantId))
    .select(['g.id', 'g.status', 'g.rules_version', 'a.allowed_configurations', 'a.is_enabled'])
    .where((eb) => eb.or([eb('g.id', '=', gameIdOrSlug), eb('g.slug', '=', gameIdOrSlug)]))
    .executeTakeFirst();
  const rules = game ? rulesFor(game.id) : null;
  if (!game || !rules || game.status !== 'published') {
    throw new HttpError(404, `Game '${gameIdOrSlug}' not found`, 'game_not_found');
  }
  if (!game.is_enabled) {
    throw new HttpError(403, `This app is not permitted to use game ${game.id}`, 'game_not_enabled');
  }

  const merged: Record<string, unknown> = { ...(game.allowed_configurations ?? {}), ...(config ?? {}) };
  if (game.id === QUIZ_GAME_ID && typeof merged.bankId === 'string') {
    const bank = await ctx.db
      .selectFrom('sagegames_quiz_banks')
      .select('questions')
      .where('tenant_id', '=', host.tenantId)
      .where('bank_id', '=', merged.bankId)
      .executeTakeFirst();
    if (!bank) throw new HttpError(400, `Quiz bank '${merged.bankId}' not found`, 'quiz_bank_not_found');
    merged.questions = bank.questions;
    delete merged.bankId;
  }

  let resolved: unknown;
  try {
    resolved = rules.parseConfig(merged);
  } catch (err) {
    if (err instanceof ConfigError) throw new HttpError(400, err.message, 'invalid_config');
    throw err;
  }
  return { gameId: game.id, rules, resolved };
}

export async function createSession(ctx: AppContext, host: HostAuth, input: CreateSessionInput): Promise<CreatedSession> {
  const { gameId, rules, resolved } = await resolveGame(ctx, host, input.gameId, input.config);
  const game = { id: gameId };
  const sessionId = randomId('sess');
  const { token, hash } = generateSessionToken();
  const expiresAt = new Date(ctx.now().getTime() + SESSION_TTL_MS);

  await ctx.db
    .insertInto('sagegames_game_sessions')
    .values({
      id: sessionId,
      tenant_id: host.tenantId,
      is_test: host.isTest,
      external_user_id: input.externalUserId,
      display_name: input.displayName ?? null,
      context_id: input.contextId ?? null,
      game_id: game.id,
      session_token_hash: hash,
      seed: crypto.randomBytes(16).toString('hex'),
      rules_version: rules.rulesVersion,
      resolved_config: json(resolved),
      metadata: json(input.metadata ?? {}),
      expires_at: expiresAt,
      created_at: ctx.now(),
    })
    .execute();

  return { sessionId, sessionToken: token, gameId: game.id, expiresAt: expiresAt.toISOString(), rulesVersion: rules.rulesVersion };
}

/** What the SDK needs to build the game locally. Never includes metadata. */
export function playPayload(ctx: AppContext, s: SessionRow) {
  return {
    sessionId: s.id,
    gameId: s.game_id,
    rulesVersion: s.rules_version,
    seed: s.seed,
    config: s.resolved_config,
    status: s.status,
    displayName: s.display_name,
    contextId: s.context_id,
    expiresAt: new Date(s.expires_at).toISOString(),
    startedAt: s.started_at ? new Date(s.started_at).toISOString() : null,
    serverNow: ctx.now().toISOString(),
  };
}

export async function startSession(ctx: AppContext, s: SessionRow, clientRulesVersion?: number) {
  if (s.mode === 'match') throw new HttpError(409, 'This is a match seat; play it over the match connection', 'match_session');
  if (clientRulesVersion !== undefined && clientRulesVersion !== s.rules_version) {
    throw new HttpError(
      426,
      `This game needs rules v${s.rules_version}, but the app has v${clientRulesVersion}. Update the SageGames SDK.`,
      'sdk_update_required'
    );
  }
  if (s.status === 'active') return playPayload(ctx, s); // retries are harmless
  if (s.status !== 'created') {
    throw new HttpError(409, `Session cannot be started from status '${s.status}'`, 'invalid_status');
  }
  const started = await ctx.db
    .updateTable('sagegames_game_sessions')
    .set({ status: 'active', started_at: ctx.now() })
    .where('id', '=', s.id)
    .where('status', '=', 'created')
    .executeTakeFirst();
  if (Number(started.numUpdatedRows) === 0) throw new HttpError(409, 'Session was started concurrently', 'invalid_status');
  return playPayload(ctx, await loadSession(ctx.db, s.id));
}

export interface CompletionResult {
  sessionId: string;
  gameId: string;
  status: 'verified' | 'rejected';
  valid: boolean;
  score: number;
  durationMs: number;
  result: unknown;
  flags: string[];
  rejectCode: string | null;
  rank: number | null;
  completedAt: string;
}

/** A session by id (it must exist). */
export async function loadSession(q: Db, sessionId: string): Promise<SessionRow> {
  return q.selectFrom('sagegames_game_sessions').selectAll().where('id', '=', sessionId).executeTakeFirstOrThrow();
}

/**
 * Replay the client's action log and store the authoritative result. Idempotent: resubmitting
 * the same log returns the stored result; a different log after completion is refused.
 */
export async function completeSession(ctx: AppContext, sessionId: string, log: unknown): Promise<CompletionResult> {
  const rules = await ctx.db.transaction().execute(async (q) => {
    const s = await forUpdate(q, q.selectFrom('sagegames_game_sessions').selectAll().where('id', '=', sessionId)).executeTakeFirst();
    if (!s) throw new HttpError(404, 'Session not found', 'session_not_found');
    const logHash = sha256Hex(JSON.stringify(log ?? null));

    if (s.status === 'completed') {
      const stored = await q.selectFrom('sagegames_session_logs').select('log_sha256').where('session_id', '=', s.id).executeTakeFirst();
      if (stored?.log_sha256 === logHash) return { replayed: false as const, s };
      throw new HttpError(409, 'This session has already been completed', 'already_completed');
    }
    if (s.mode === 'match') throw new HttpError(409, 'This is a match seat; play it over the match connection', 'match_session');
    if (s.status !== 'active' && s.status !== 'paused') {
      throw new HttpError(409, `Session cannot be completed from status '${s.status}'`, 'invalid_status');
    }

    const now = ctx.now();
    const serverElapsedMs = now.getTime() - new Date(s.started_at ?? s.created_at).getTime();
    await recordResult(q, s, log, judge(s, log, serverElapsedMs), now);
    return { replayed: true as const, s };
  });

  return loadCompletion(ctx.db, rules.s.id);
}

export interface Verdict {
  status: 'verified' | 'rejected';
  score: number;
  durationMs: number;
  result: unknown;
  flags: string[];
  rejectCode: string | null;
}

/** Replay a session's action log and decide its authoritative outcome. */
export function judge(s: SessionRow, log: unknown, serverElapsedMs?: number): Verdict {
  const gameRules = rulesFor(s.game_id);
  if (!gameRules) throw new HttpError(500, `No rules for ${s.game_id}`, 'internal');
  try {
    const outcome = replay(gameRules, { seed: s.seed, config: s.resolved_config, log, serverElapsedMs });
    return {
      status: 'verified',
      score: outcome.score,
      durationMs: Math.round(outcome.activeMs),
      result: outcome.result,
      flags: outcome.flags,
      rejectCode: null,
    };
  } catch (err) {
    if (!(err instanceof ReplayRejected)) throw err;
    return { status: 'rejected', score: 0, durationMs: 0, result: {}, flags: [], rejectCode: err.code };
  }
}

/**
 * Store a session's result (solo or match) inside the caller's transaction: completes the
 * session, keeps the log, writes the result and stats, and queues the session.completed webhook.
 */
export async function recordResult(q: Db, s: SessionRow, log: unknown, verdict: Verdict, now: Date): Promise<void> {
  const { status, score, durationMs, result, flags, rejectCode } = verdict;
  const isValid = status === 'verified' && flags.length === 0 && !s.is_test;

  await q.updateTable('sagegames_game_sessions').set({ status: 'completed', completed_at: now }).where('id', '=', s.id).execute();
  await q
    .insertInto('sagegames_session_logs')
    .values({ session_id: s.id, log: json(log), log_sha256: sha256Hex(JSON.stringify(log ?? null)), received_at: now })
    .execute();
  await q
    .insertInto('sagegames_game_results')
    .values({
      id: randomId('res'),
      session_id: s.id,
      tenant_id: s.tenant_id,
      game_id: s.game_id,
      external_user_id: s.external_user_id,
      display_name: s.display_name,
      context_id: s.context_id,
      status,
      reject_code: rejectCode,
      score,
      duration_ms: durationMs,
      result: json(result),
      flags: json(flags),
      is_valid: isValid,
      is_test: s.is_test,
      rules_version: s.rules_version,
      completed_at: now,
    })
    .execute();

  if (isValid) {
    const stat = (column: string) => sql.ref<number>(`sagegames_player_stats.${column}`);
    await onConflictUpdate(
      q,
      q.insertInto('sagegames_player_stats').values({
        tenant_id: s.tenant_id,
        external_user_id: s.external_user_id,
        game_id: s.game_id,
        games_completed: 1,
        total_score: score,
        highest_score: score,
        total_play_time_ms: durationMs,
        updated_at: now,
      }),
      ['tenant_id', 'external_user_id', 'game_id'],
      {
        games_completed: sql`${stat('games_completed')} + 1`,
        total_score: sql`${stat('total_score')} + ${score}`,
        highest_score: greatest(q, stat('highest_score'), sql.val(score)),
        total_play_time_ms: sql`${stat('total_play_time_ms')} + ${durationMs}`,
        updated_at: now,
      }
    ).execute();
  }

  if (!s.is_test) {
    await enqueueWebhook(q, s.tenant_id, 'session.completed', {
      sessionId: s.id,
      gameId: s.game_id,
      externalUserId: s.external_user_id,
      displayName: s.display_name,
      contextId: s.context_id,
      status,
      valid: isValid,
      score,
      durationMs,
      result,
      flags,
      rejectCode,
      completedAt: now.toISOString(),
      matchId: s.match_id,
    }, now);
  }
}

export async function loadCompletion(q: Db, sessionId: string): Promise<CompletionResult> {
  const r = await q.selectFrom('sagegames_game_results').selectAll().where('session_id', '=', sessionId).executeTakeFirst();
  if (!r) throw new HttpError(404, 'Result not found', 'result_not_found');
  const rank = r.is_valid
    ? await rankFor(q, { tenantId: r.tenant_id, gameId: r.game_id, contextId: r.context_id, externalUserId: r.external_user_id })
    : null;
  return {
    sessionId: r.session_id,
    gameId: r.game_id,
    status: r.status === 'rejected' ? 'rejected' : 'verified',
    valid: r.is_valid,
    score: r.score,
    durationMs: r.duration_ms,
    result: r.result,
    flags: r.flags,
    rejectCode: r.reject_code,
    rank,
    completedAt: r.completed_at.toISOString(),
  };
}
