-- Remove the tables created by the old services/api/src/db/schema.sql in `public`.
-- The platform never used them (the API was in-memory), they have no RLS, and `public` is exposed
-- through Supabase's Data API, so anyone with the anon key could read and write them.
--
-- Safety guard: abort (dropping nothing) if any of them contains data.

DO $$
DECLARE
  t TEXT;
  n BIGINT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'leaderboard_entries', 'leaderboards', 'webhooks', 'player_stats', 'game_results', 'game_events',
    'game_sessions', 'tenant_game_access', 'game_versions', 'games', 'external_users', 'api_keys',
    'applications', 'tenants'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
      IF n > 0 THEN
        RAISE EXCEPTION 'public.% has % rows; refusing to drop legacy tables', t, n;
      END IF;
    END IF;
  END LOOP;
END $$;

DROP TABLE IF EXISTS
  public.leaderboard_entries,
  public.leaderboards,
  public.webhooks,
  public.player_stats,
  public.game_results,
  public.game_events,
  public.game_sessions,
  public.tenant_game_access,
  public.game_versions,
  public.games,
  public.external_users,
  public.api_keys,
  public.applications,
  public.tenants;
