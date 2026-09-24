import { GamePlayerStats, Leaderboard, LeaderboardPeriod, PlayerStats } from '@sagegames/types';
import { one, Queryable } from '../db/db';

export interface BoardFilter {
  tenantId: string;
  gameId: string;
  period?: LeaderboardPeriod;
  /** Restrict to one chat, group or other host-defined context. */
  contextId?: string | null;
}

const DAY_MS = 24 * 3600 * 1000;

export function periodStart(period: LeaderboardPeriod | undefined, now: Date): Date {
  switch (period) {
    case 'daily':
      return new Date(now.getTime() - DAY_MS);
    case 'weekly':
      return new Date(now.getTime() - 7 * DAY_MS);
    case 'monthly':
      return new Date(now.getTime() - 30 * DAY_MS);
    default:
      return new Date(0);
  }
}

// Best valid score per player, then ranked. Ties share a rank; earlier achievers list first.
const BEST_PER_PLAYER = `
  SELECT DISTINCT ON (external_user_id) external_user_id, display_name, score, completed_at
    FROM game_results
   WHERE tenant_id = $1 AND game_id = $2 AND is_valid AND status = 'verified'
     AND completed_at >= $3 AND ($4::text IS NULL OR context_id = $4)
   ORDER BY external_user_id, score DESC, completed_at ASC`;

export async function leaderboard(
  q: Queryable,
  filter: BoardFilter,
  page: { limit: number; offset: number },
  now: Date
): Promise<Leaderboard & { contextId?: string }> {
  const rows = await q.query<{
    external_user_id: string;
    display_name: string | null;
    score: number;
    completed_at: Date;
    rank: number;
    total: number;
  }>(
    `WITH best AS (${BEST_PER_PLAYER})
     SELECT *, (RANK() OVER (ORDER BY score DESC))::int AS rank, (COUNT(*) OVER ())::int AS total
       FROM best
      ORDER BY score DESC, completed_at ASC
      LIMIT $5 OFFSET $6`,
    [filter.tenantId, filter.gameId, periodStart(filter.period, now), filter.contextId ?? null, page.limit, page.offset]
  );

  let total = rows[0]?.total ?? 0;
  if (rows.length === 0 && page.offset > 0) {
    const count = await one<{ total: number }>(
      q,
      `WITH best AS (${BEST_PER_PLAYER}) SELECT COUNT(*)::int AS total FROM best`,
      [filter.tenantId, filter.gameId, periodStart(filter.period, now), filter.contextId ?? null]
    );
    total = count?.total ?? 0;
  }

  return {
    gameId: filter.gameId,
    contextId: filter.contextId ?? undefined,
    period: filter.period ?? 'all_time',
    totalPlayers: total,
    entries: rows.map((r) => ({
      rank: r.rank,
      externalUserId: r.external_user_id,
      username: r.display_name ?? undefined,
      score: r.score,
      achievedAt: new Date(r.completed_at).toISOString(),
      gameId: filter.gameId,
    })),
  };
}

/** A player's all-time rank for a game (and context, if given), or null if unranked. */
export async function rankFor(
  q: Queryable,
  filter: { tenantId: string; gameId: string; contextId: string | null; externalUserId: string }
): Promise<number | null> {
  const row = await one<{ rank: number }>(
    q,
    `WITH best AS (${BEST_PER_PLAYER}),
          ranked AS (SELECT external_user_id, (RANK() OVER (ORDER BY score DESC))::int AS rank FROM best)
     SELECT rank FROM ranked WHERE external_user_id = $5`,
    [filter.tenantId, filter.gameId, new Date(0), filter.contextId, filter.externalUserId]
  );
  return row?.rank ?? null;
}

export async function playerStats(q: Queryable, tenantId: string, externalUserId: string): Promise<PlayerStats> {
  const rows = await q.query<{
    game_id: string;
    games_completed: number;
    total_score: string | number;
    highest_score: number;
    total_play_time_ms: string | number;
  }>('SELECT * FROM player_stats WHERE tenant_id = $1 AND external_user_id = $2', [tenantId, externalUserId]);

  const played = await one<{ n: number }>(
    q,
    `SELECT COUNT(*)::int AS n FROM game_sessions WHERE tenant_id = $1 AND external_user_id = $2 AND status <> 'created'`,
    [tenantId, externalUserId]
  );

  const perGameStats: Record<string, GamePlayerStats> = {};
  let gamesCompleted = 0;
  let totalScore = 0;
  for (const r of rows) {
    const total = Number(r.total_score);
    gamesCompleted += r.games_completed;
    totalScore += total;
    perGameStats[r.game_id] = {
      gameId: r.game_id,
      gamesPlayed: r.games_completed,
      gamesCompleted: r.games_completed,
      totalScore: total,
      highestScore: r.highest_score,
      averageScore: r.games_completed > 0 ? total / r.games_completed : 0,
      totalPlayTimeSeconds: Math.round(Number(r.total_play_time_ms) / 1000),
    };
  }

  return {
    externalUserId,
    gamesPlayed: played?.n ?? 0,
    gamesCompleted,
    totalScore,
    averageScore: gamesCompleted > 0 ? totalScore / gamesCompleted : 0,
    perGameStats,
  };
}
