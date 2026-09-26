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
  const rows = await db.query<Record<string, unknown>>(
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
    [tenantId, f.externalUserId ?? null, f.gameId ?? null, f.contextId ?? null, f.since ?? null, f.limit]
  );
  return rows.map((r) => ({
    sessionId: r.session_id as string,
    gameId: r.game_id as string,
    externalUserId: r.external_user_id as string,
    displayName: r.display_name as string | null,
    contextId: r.context_id as string | null,
    status: r.status as string,
    rejectCode: r.reject_code as string | null,
    valid: r.is_valid as boolean,
    isTest: r.is_test as boolean,
    score: r.score as number,
    durationMs: r.duration_ms as number,
    result: r.result,
    flags: r.flags as string[],
    completedAt: new Date(r.completed_at as Date).toISOString(),
  }));
}
