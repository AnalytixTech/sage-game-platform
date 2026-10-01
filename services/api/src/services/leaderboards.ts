import { sql } from 'kysely';
import { GamePlayerStats, Leaderboard, LeaderboardPeriod, PlayerStats } from '@sagegames/types';
import { Db } from '../db/db';

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

/**
 * Best valid score per player (earliest achievement wins a tie with yourself). Window functions,
 * so it runs the same on Postgres, MySQL 8+ and SQLite 3.25+.
 */
function bestPerPlayer(f: { tenantId: string; gameId: string; since: Date; contextId: string | null }) {
  return sql`
    select external_user_id, display_name, score, completed_at
      from (
        select external_user_id, display_name, score, completed_at,
               row_number() over (partition by external_user_id order by score desc, completed_at asc) as best_rank
          from ${sql.table('sagegames_game_results')}
         where tenant_id = ${f.tenantId}
           and game_id = ${f.gameId}
           and is_valid = ${true}
           and status = 'verified'
           and completed_at >= ${f.since}
           ${f.contextId !== null ? sql`and context_id = ${f.contextId}` : sql``}
      ) per_player
     where best_rank = 1`;
}

interface BoardRow {
  external_user_id: string;
  display_name: string | null;
  score: number;
  completed_at: Date;
  rank: number;
  total: number;
}

export async function leaderboard(
  q: Db,
  filter: BoardFilter,
  page: { limit: number; offset: number },
  now: Date
): Promise<Leaderboard & { contextId?: string }> {
  const best = bestPerPlayer({ tenantId: filter.tenantId, gameId: filter.gameId, since: periodStart(filter.period, now), contextId: filter.contextId ?? null });
  // Ties share a rank; earlier achievers list first.
  const { rows } = await sql<BoardRow>`
    with best as (${best})
    select external_user_id, display_name, score, completed_at,
           rank() over (order by score desc) as ${sql.id('rank')},
           count(*) over () as total
      from best
     order by score desc, completed_at asc, external_user_id asc
     limit ${page.limit} offset ${page.offset}`.execute(q);

  let total = Number(rows[0]?.total ?? 0);
  if (rows.length === 0 && page.offset > 0) {
    const count = await sql<{ total: number }>`with best as (${best}) select count(*) as total from best`.execute(q);
    total = Number(count.rows[0]?.total ?? 0);
  }

  return {
    gameId: filter.gameId,
    contextId: filter.contextId ?? undefined,
    period: filter.period ?? 'all_time',
    totalPlayers: total,
    entries: rows.map((r) => ({
      rank: Number(r.rank),
      externalUserId: r.external_user_id,
      username: r.display_name ?? undefined,
      score: Number(r.score),
      achievedAt: r.completed_at.toISOString(),
      gameId: filter.gameId,
    })),
  };
}

/** A player's all-time rank for a game (and context, if given), or null if unranked. */
export async function rankFor(
  q: Db,
  filter: { tenantId: string; gameId: string; contextId: string | null; externalUserId: string }
): Promise<number | null> {
  const best = bestPerPlayer({ tenantId: filter.tenantId, gameId: filter.gameId, since: new Date(0), contextId: filter.contextId });
  const { rows } = await sql<{ player_rank: number }>`
    with best as (${best}),
         ranked as (select external_user_id, rank() over (order by score desc) as player_rank from best)
    select player_rank from ranked where external_user_id = ${filter.externalUserId}`.execute(q);
  return rows[0] ? Number(rows[0].player_rank) : null;
}

export async function playerStats(q: Db, tenantId: string, externalUserId: string): Promise<PlayerStats> {
  const rows = await q
    .selectFrom('sagegames_player_stats')
    .selectAll()
    .where('tenant_id', '=', tenantId)
    .where('external_user_id', '=', externalUserId)
    .execute();

  const played = await q
    .selectFrom('sagegames_game_sessions')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('tenant_id', '=', tenantId)
    .where('external_user_id', '=', externalUserId)
    .where('status', '<>', 'created')
    .executeTakeFirst();

  const perGameStats: Record<string, GamePlayerStats> = {};
  let gamesCompleted = 0;
  let totalScore = 0;
  for (const r of rows) {
    const total = Number(r.total_score);
    const completed = Number(r.games_completed);
    gamesCompleted += completed;
    totalScore += total;
    perGameStats[r.game_id] = {
      gameId: r.game_id,
      gamesPlayed: completed,
      gamesCompleted: completed,
      totalScore: total,
      highestScore: Number(r.highest_score),
      averageScore: completed > 0 ? total / completed : 0,
      totalPlayTimeSeconds: Math.round(Number(r.total_play_time_ms) / 1000),
    };
  }

  return {
    externalUserId,
    gamesPlayed: Number(played?.n ?? 0),
    gamesCompleted,
    totalScore,
    averageScore: gamesCompleted > 0 ? totalScore / gamesCompleted : 0,
    perGameStats,
  };
}
