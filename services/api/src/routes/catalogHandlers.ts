import { GameRow, toGame } from '../catalog';
import { AppContext, HostAuth } from '../http/context';
import { asyncHandler, HttpError } from '../http/errors';

/** Catalog handlers shared by v1 and v2. With a host key, the list is narrowed to the app's games. */
export function catalogHandlers(ctx: AppContext) {
  const list = asyncHandler(async (req, res) => {
    const host: HostAuth | null = res.locals.host ?? null;
    const category = typeof req.query.category === 'string' ? req.query.category : null;
    let query = ctx.db.selectFrom('sagegames_games as g').selectAll('g').where('g.status', '=', 'published');
    if (category !== null) query = query.where('g.category', '=', category);
    if (host) {
      query = query.where((eb) =>
        eb.exists(
          eb
            .selectFrom('sagegames_tenant_game_access as a')
            .select('a.game_id')
            .where('a.tenant_id', '=', host.tenantId)
            .whereRef('a.game_id', '=', 'g.id')
            .where('a.is_enabled', '=', true)
        )
      );
    }
    const rows = await query.orderBy('g.name').execute();
    res.json(rows.map((r) => toGame(r as GameRow)));
  });

  const get = asyncHandler(async (req, res) => {
    const row = await ctx.db
      .selectFrom('sagegames_games')
      .selectAll()
      .where((eb) => eb.or([eb('id', '=', req.params.gameId), eb('slug', '=', req.params.gameId)]))
      .where('status', '=', 'published')
      .executeTakeFirst();
    if (!row) throw new HttpError(404, 'Game not found', 'game_not_found');
    res.json(toGame(row as GameRow));
  });

  return { list, get };
}
