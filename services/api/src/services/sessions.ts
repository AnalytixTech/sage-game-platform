import crypto from 'crypto';
import { ConfigError, replay, ReplayRejected } from '@sagegames/engine';
import { generateSessionToken, randomId, sha256Hex } from '../auth/keys';
import { rulesFor } from '../catalog';
import { one, Queryable } from '../db/db';
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
  const game = await one<{ id: string; status: string; rules_version: number; allowed_configurations: Record<string, unknown> | null; is_enabled: boolean | null }>(
    ctx.db,
    `SELECT g.id, g.status, g.rules_version, a.allowed_configurations, a.is_enabled
       FROM games g
       LEFT JOIN tenant_game_access a ON a.game_id = g.id AND a.tenant_id = $1
      WHERE g.id = $2 OR g.slug = $2`,
    [host.tenantId, gameIdOrSlug]
  );
  const rules = game ? rulesFor(game.id) : null;
  if (!game || !rules || game.status !== 'published') {
    throw new HttpError(404, `Game '${gameIdOrSlug}' not found`, 'game_not_found');
  }
  if (!game.is_enabled) {
    throw new HttpError(403, `This app is not permitted to use game ${game.id}`, 'game_not_enabled');
  }

  const merged: Record<string, unknown> = { ...(game.allowed_configurations ?? {}), ...(config ?? {}) };
  if (game.id === QUIZ_GAME_ID && typeof merged.bankId === 'string') {
    const bank = await one<{ questions: unknown }>(
      ctx.db,
      'SELECT questions FROM quiz_banks WHERE tenant_id = $1 AND bank_id = $2',
      [host.tenantId, merged.bankId]
    );
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

  await ctx.db.query(
    `INSERT INTO game_sessions
       (id, tenant_id, is_test, external_user_id, display_name, context_id, game_id, session_token_hash,
        seed, rules_version, resolved_config, metadata, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      sessionId,
      host.tenantId,
      host.isTest,
      input.externalUserId,
      input.displayName ?? null,
      input.contextId ?? null,
      game.id,
      hash,
      crypto.randomBytes(16).toString('hex'),
      rules.rulesVersion,
      JSON.stringify(resolved),
      JSON.stringify(input.metadata ?? {}),
      expiresAt,
      ctx.now(),
    ]
  );

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
  const [row] = await ctx.db.query<SessionRow>(
    `UPDATE game_sessions SET status = 'active', started_at = $2 WHERE id = $1 AND status = 'created' RETURNING *`,
    [s.id, ctx.now()]
  );
  if (!row) throw new HttpError(409, 'Session was started concurrently', 'invalid_status');
  return playPayload(ctx, row);
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

interface ResultRow {
  session_id: string;
  game_id: string;
  status: 'verified' | 'rejected' | 'unverified';
  is_valid: boolean;
  score: number;
  duration_ms: number;
  result: unknown;
  flags: string[];
  reject_code: string | null;
  completed_at: Date;
  tenant_id: string;
  external_user_id: string;
  context_id: string | null;
}

/**
 * Replay the client's action log and store the authoritative result. Idempotent: resubmitting
 * the same log returns the stored result; a different log after completion is refused.
 */
export async function completeSession(ctx: AppContext, sessionId: string, log: unknown): Promise<CompletionResult> {
  const rules = await ctx.db.tx(async (q) => {
    const s = await one<SessionRow>(q, 'SELECT * FROM game_sessions WHERE id = $1 FOR UPDATE', [sessionId]);
    if (!s) throw new HttpError(404, 'Session not found', 'session_not_found');
    const logHash = sha256Hex(JSON.stringify(log ?? null));

    if (s.status === 'completed') {
      const stored = await one<{ log_sha256: string }>(q, 'SELECT log_sha256 FROM session_logs WHERE session_id = $1', [s.id]);
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
export async function recordResult(q: Queryable, s: SessionRow, log: unknown, verdict: Verdict, now: Date): Promise<void> {
  const { status, score, durationMs, result, flags, rejectCode } = verdict;
  const isValid = status === 'verified' && flags.length === 0 && !s.is_test;

  await q.query(`UPDATE game_sessions SET status = 'completed', completed_at = $2 WHERE id = $1`, [s.id, now]);
  await q.query(`INSERT INTO session_logs (session_id, log, log_sha256) VALUES ($1, $2, $3)`, [
    s.id,
    JSON.stringify(log ?? null),
    sha256Hex(JSON.stringify(log ?? null)),
  ]);
  await q.query(
    `INSERT INTO game_results
       (id, session_id, tenant_id, game_id, external_user_id, display_name, context_id, status, reject_code,
        score, duration_ms, result, flags, is_valid, is_test, rules_version, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [
      randomId('res'),
      s.id,
      s.tenant_id,
      s.game_id,
      s.external_user_id,
      s.display_name,
      s.context_id,
      status,
      rejectCode,
      score,
      durationMs,
      JSON.stringify(result),
      JSON.stringify(flags),
      isValid,
      s.is_test,
      s.rules_version,
      now,
    ]
  );

  if (isValid) {
    await q.query(
      `INSERT INTO player_stats (tenant_id, external_user_id, game_id, games_completed, total_score, highest_score, total_play_time_ms, updated_at)
       VALUES ($1, $2, $3, 1, $4::bigint, $5::int, $6::bigint, now())
       ON CONFLICT (tenant_id, external_user_id, game_id) DO UPDATE SET
         games_completed = player_stats.games_completed + 1,
         total_score = player_stats.total_score + EXCLUDED.total_score,
         highest_score = GREATEST(player_stats.highest_score, EXCLUDED.highest_score),
         total_play_time_ms = player_stats.total_play_time_ms + EXCLUDED.total_play_time_ms,
         updated_at = now()`,
      [s.tenant_id, s.external_user_id, s.game_id, score, score, durationMs]
    );
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

export async function loadCompletion(q: Queryable, sessionId: string): Promise<CompletionResult> {
  const r = await one<ResultRow>(q, 'SELECT * FROM game_results WHERE session_id = $1', [sessionId]);
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
    completedAt: new Date(r.completed_at).toISOString(),
  };
}
