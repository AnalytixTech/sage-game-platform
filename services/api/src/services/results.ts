import { Db } from '../db/db';

export interface ResultFilters {
  externalUserId?: string;
  gameId?: string;
  contextId?: string;
  since?: Date;
  limit: number;
}

export interface ResultSummary {
  sessionId: string;
  gameId: string;
  externalUserId: string;
  displayName: string | null;
  contextId: string | null;
  status: string;
  rejectCode: string | null;
  valid: boolean;
  isTest: boolean;
  score: number;
  durationMs: number;
  result: unknown;
  flags: string[];
  completedAt: string;
}

/** Newest results first, for one app (host API and portal). */
export async function listResults(db: Db, tenantId: string, f: ResultFilters): Promise<ResultSummary[]> {
  let query = db
    .selectFrom('sagegames_game_results')
    .select([
      'session_id',
      'game_id',
      'external_user_id',
      'display_name',
      'context_id',
      'status',
      'reject_code',
      'score',
      'duration_ms',
      'result',
      'flags',
      'is_valid',
      'is_test',
      'completed_at',
    ])
    .where('tenant_id', '=', tenantId);
  if (f.externalUserId !== undefined) query = query.where('external_user_id', '=', f.externalUserId);
  if (f.gameId !== undefined) query = query.where('game_id', '=', f.gameId);
  if (f.contextId !== undefined) query = query.where('context_id', '=', f.contextId);
  if (f.since !== undefined) query = query.where('completed_at', '>=', f.since);
  const rows = await query.orderBy('completed_at', 'desc').orderBy('session_id').limit(f.limit).execute();

  return rows.map((r) => ({
    sessionId: r.session_id,
    gameId: r.game_id,
    externalUserId: r.external_user_id,
    displayName: r.display_name,
    contextId: r.context_id,
    status: r.status,
    rejectCode: r.reject_code,
    valid: r.is_valid,
    isTest: r.is_test,
    score: Number(r.score),
    durationMs: Number(r.duration_ms),
    result: r.result,
    flags: r.flags,
    completedAt: r.completed_at.toISOString(),
  }));
}
