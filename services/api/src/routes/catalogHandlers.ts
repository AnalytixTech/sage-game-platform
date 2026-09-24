import { GameRow, toGame } from '../catalog';
import { one } from '../db/db';
import { AppContext, HostAuth } from '../http/context';
import { asyncHandler, HttpError } from '../http/errors';

/** Catalog handlers shared by v1 and v2. With a host key, the list is narrowed to the app's games. */
export function catalogHandlers(ctx: AppContext) {
  const list = asyncHandler(async (req, res) => {
    const host: HostAuth | null = res.locals.host ?? null;
    const category = typeof req.query.category === 'string' ? req.query.category : null;
    const rows = await ctx.db.query<GameRow>(
      `SELECT g.* FROM games g
        WHERE g.status = 'published'
          AND ($1::text IS NULL OR g.category = $1)
          AND ($2::text IS NULL OR EXISTS (
                SELECT 1 FROM tenant_game_access a WHERE a.tenant_id = $2 AND a.game_id = g.id AND a.is_enabled))
        ORDER BY g.name`,
      [category, host?.tenantId ?? null]
    );
    res.json(rows.map(toGame));
  });

  const get = asyncHandler(async (req, res) => {
    const row = await one<GameRow>(ctx.db, `SELECT * FROM games WHERE (id = $1 OR slug = $1) AND status = 'published'`, [
      req.params.gameId,
    ]);
    if (!row) throw new HttpError(404, 'Game not found', 'game_not_found');
    res.json(toGame(row));
  });

  return { list, get };
}
