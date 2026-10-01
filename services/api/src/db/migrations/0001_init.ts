/**
 * The SageGames schema, for Postgres, MySQL 8 / MariaDB and SQLite.
 *
 * Portable choices: ids and keys are VARCHAR(191) (indexable on MySQL with utf8mb4); timestamps are
 * timestamptz / DATETIME(3) / ISO text, always written by the app in UTC; JSON is jsonb on Postgres
 * and text elsewhere; foreign keys are table constraints (MySQL ignores inline REFERENCES). Access
 * control lives in the API: there are no database roles or row-level policies to manage.
 */
import { ColumnDataType, CreateTableBuilder, Expression, Kysely, sql } from 'kysely';
import { dialectOf } from '../db';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Table = CreateTableBuilder<any, any>;

export async function up(db: AnyDb): Promise<void> {
  const dialect = dialectOf(db);
  const ID = 'varchar(191)' as const;
  const TS: ColumnDataType | Expression<unknown> = dialect === 'postgres' ? 'timestamptz' : dialect === 'mysql' ? 'datetime(3)' : 'text';
  const JSON_T: ColumnDataType | Expression<unknown> = dialect === 'postgres' ? 'jsonb' : dialect === 'mysql' ? sql`longtext` : 'text';
  const oneOf = (column: string, values: string[]) => sql`${sql.ref(column)} in (${sql.join(values.map((v) => sql.lit(v)))})`;
  const fk = (t: Table, column: string, ref: string, onDelete: 'cascade' | 'set null' | 'restrict', table: string) =>
    t.addForeignKeyConstraint(`${table}_${column}_fk`, [column], ref.split('.')[0], [ref.split('.')[1]], (c) => c.onDelete(onDelete));
  // Partial indexes where supported; a plain index on MySQL.
  const index = async (name: string, table: string, columns: string[], where?: string, unique = false) => {
    let b = db.schema.createIndex(name).on(table).columns(columns);
    if (unique) b = b.unique();
    if (where && dialect !== 'mysql') b = b.where(sql.raw<boolean>(where));
    await b.execute();
  };

  // ---- Portal accounts
  await db.schema
    .createTable('sagegames_users')
    .addColumn('id', ID, (c) => c.primaryKey())
    .addColumn('email', 'varchar(320)', (c) => c.notNull())
    .addColumn('password_hash', 'varchar(255)')
    .addColumn('email_verified_at', TS)
    .addColumn('token_epoch', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('created_at', TS, (c) => c.notNull())
    .addColumn('updated_at', TS, (c) => c.notNull())
    .execute();
  await index('sagegames_users_email', 'sagegames_users', ['email'], undefined, true);

  await db.schema
    .createTable('sagegames_refresh_tokens')
    .addColumn('id', ID, (c) => c.primaryKey())
    .addColumn('user_id', ID, (c) => c.notNull())
    .addColumn('family_id', ID, (c) => c.notNull())
    .addColumn('token_hash', ID, (c) => c.notNull())
    .addColumn('expires_at', TS, (c) => c.notNull())
    .addColumn('created_at', TS, (c) => c.notNull())
    .addColumn('revoked_at', TS)
    .$call((t) => fk(t, 'user_id', 'sagegames_users.id', 'cascade', 'sagegames_refresh_tokens'))
    .execute();
  await index('sagegames_refresh_tokens_hash', 'sagegames_refresh_tokens', ['token_hash'], undefined, true);
  await index('sagegames_refresh_tokens_user', 'sagegames_refresh_tokens', ['user_id']);
  await index('sagegames_refresh_tokens_family', 'sagegames_refresh_tokens', ['family_id']);

  await db.schema
    .createTable('sagegames_auth_tokens')
    .addColumn('token_hash', ID, (c) => c.primaryKey())
    .addColumn('user_id', ID, (c) => c.notNull())
    .addColumn('purpose', 'varchar(32)', (c) => c.notNull().check(oneOf('purpose', ['verify_email', 'reset_password', 'change_email'])))
    .addColumn('email', 'varchar(320)')
    .addColumn('expires_at', TS, (c) => c.notNull())
    .addColumn('used_at', TS)
    .addColumn('created_at', TS, (c) => c.notNull())
    .$call((t) => fk(t, 'user_id', 'sagegames_users.id', 'cascade', 'sagegames_auth_tokens'))
    .execute();
  await index('sagegames_auth_tokens_user', 'sagegames_auth_tokens', ['user_id']);

  // ---- Apps (tenants), members and keys
  await db.schema
    .createTable('sagegames_tenants')
    .addColumn('id', ID, (c) => c.primaryKey())
    .addColumn('name', 'varchar(255)', (c) => c.notNull())
    .addColumn('status', 'varchar(32)', (c) => c.notNull().defaultTo('active').check(oneOf('status', ['active', 'suspended'])))
    .addColumn('webhook_url', 'text')
    .addColumn('webhook_secret', 'varchar(255)')
    .addColumn('created_at', TS, (c) => c.notNull())
    .addColumn('updated_at', TS, (c) => c.notNull())
    .execute();

  await db.schema
    .createTable('sagegames_tenant_members')
    .addColumn('tenant_id', ID, (c) => c.notNull())
    .addColumn('user_id', ID, (c) => c.notNull())
    .addColumn('role', 'varchar(16)', (c) => c.notNull().check(oneOf('role', ['owner', 'admin'])))
    .addColumn('created_at', TS, (c) => c.notNull())
    .addPrimaryKeyConstraint('sagegames_tenant_members_pk', ['tenant_id', 'user_id'])
    .$call((t) => fk(t, 'tenant_id', 'sagegames_tenants.id', 'cascade', 'sagegames_tenant_members'))
    .$call((t) => fk(t, 'user_id', 'sagegames_users.id', 'cascade', 'sagegames_tenant_members'))
    .execute();
  await index('sagegames_tenant_members_user', 'sagegames_tenant_members', ['user_id']);

  // Host API keys: sk_<mode>_<id>_<secret>. Only an HMAC of the secret is stored.
  await db.schema
    .createTable('sagegames_api_keys')
    .addColumn('id', ID, (c) => c.primaryKey())
    .addColumn('tenant_id', ID, (c) => c.notNull())
    .addColumn('mode', 'varchar(8)', (c) => c.notNull().check(oneOf('mode', ['live', 'test'])))
    .addColumn('key_hash', 'varchar(255)', (c) => c.notNull())
    .addColumn('label', 'varchar(255)', (c) => c.notNull().defaultTo(''))
    .addColumn('created_by', ID)
    .addColumn('created_at', TS, (c) => c.notNull())
    .addColumn('last_used_at', TS)
    .addColumn('revoked_at', TS)
    .$call((t) => fk(t, 'tenant_id', 'sagegames_tenants.id', 'cascade', 'sagegames_api_keys'))
    .$call((t) => fk(t, 'created_by', 'sagegames_users.id', 'set null', 'sagegames_api_keys'))
    .execute();
  await index('sagegames_api_keys_tenant', 'sagegames_api_keys', ['tenant_id']);

  // ---- Game catalog (synced from code when the API starts) and per-app access
  await db.schema
    .createTable('sagegames_games')
    .addColumn('id', ID, (c) => c.primaryKey())
    .addColumn('slug', ID, (c) => c.notNull())
    .addColumn('name', 'varchar(255)', (c) => c.notNull())
    .addColumn('description', 'text')
    .addColumn('version', 'varchar(64)', (c) => c.notNull())
    .addColumn('category', 'varchar(64)', (c) => c.notNull())
    .addColumn('status', 'varchar(32)', (c) => c.notNull())
    .addColumn('delivery_model', 'varchar(64)', (c) => c.notNull())
    .addColumn('thumbnail', 'text')
    .addColumn('supported_platforms', JSON_T, (c) => c.notNull())
    .addColumn('rules_version', 'integer', (c) => c.notNull())
    .addColumn('updated_at', TS, (c) => c.notNull())
    .execute();
  await index('sagegames_games_slug', 'sagegames_games', ['slug'], undefined, true);

  await db.schema
    .createTable('sagegames_tenant_game_access')
    .addColumn('tenant_id', ID, (c) => c.notNull())
    .addColumn('game_id', ID, (c) => c.notNull())
    .addColumn('is_enabled', 'boolean', (c) => c.notNull().defaultTo(true))
    .addColumn('allowed_configurations', JSON_T, (c) => c.notNull())
    .addPrimaryKeyConstraint('sagegames_tenant_game_access_pk', ['tenant_id', 'game_id'])
    .$call((t) => fk(t, 'tenant_id', 'sagegames_tenants.id', 'cascade', 'sagegames_tenant_game_access'))
    .$call((t) => fk(t, 'game_id', 'sagegames_games.id', 'cascade', 'sagegames_tenant_game_access'))
    .execute();

  // ---- Battles (before sessions, which reference them)
  await db.schema
    .createTable('sagegames_matches')
    .addColumn('id', ID, (c) => c.primaryKey())
    .addColumn('tenant_id', ID, (c) => c.notNull())
    .addColumn('game_id', ID, (c) => c.notNull())
    .addColumn('is_test', 'boolean', (c) => c.notNull().defaultTo(false))
    .addColumn('context_id', ID)
    .addColumn('seed', 'varchar(255)', (c) => c.notNull())
    .addColumn('rules_version', 'integer', (c) => c.notNull())
    .addColumn('resolved_config', JSON_T, (c) => c.notNull())
    .addColumn('status', 'varchar(32)', (c) =>
      c.notNull().defaultTo('lobby').check(oneOf('status', ['lobby', 'countdown', 'in_progress', 'finished', 'cancelled', 'aborted']))
    )
    .addColumn('min_players', 'integer', (c) => c.notNull().defaultTo(2))
    .addColumn('max_players', 'integer', (c) => c.notNull().defaultTo(8))
    .addColumn('allow_join', 'boolean', (c) => c.notNull().defaultTo(false))
    .addColumn('lobby_expires_at', TS, (c) => c.notNull())
    .addColumn('started_at', TS)
    .addColumn('finished_at', TS)
    .addColumn('standings', JSON_T)
    .addColumn('created_at', TS, (c) => c.notNull())
    .$call((t) => fk(t, 'tenant_id', 'sagegames_tenants.id', 'cascade', 'sagegames_matches'))
    .$call((t) => fk(t, 'game_id', 'sagegames_games.id', 'restrict', 'sagegames_matches'))
    .execute();
  await index('sagegames_matches_tenant_created', 'sagegames_matches', ['tenant_id', 'created_at']);
  await index('sagegames_matches_active', 'sagegames_matches', ['status'], `status in ('lobby', 'countdown', 'in_progress')`);

  // ---- Sessions, logs and verified results
  await db.schema
    .createTable('sagegames_game_sessions')
    .addColumn('id', ID, (c) => c.primaryKey())
    .addColumn('tenant_id', ID, (c) => c.notNull())
    .addColumn('is_test', 'boolean', (c) => c.notNull().defaultTo(false))
    .addColumn('external_user_id', ID, (c) => c.notNull())
    .addColumn('display_name', 'text')
    .addColumn('context_id', ID)
    .addColumn('game_id', ID, (c) => c.notNull())
    .addColumn('session_token_hash', ID, (c) => c.notNull())
    .addColumn('status', 'varchar(16)', (c) =>
      c.notNull().defaultTo('created').check(oneOf('status', ['created', 'active', 'paused', 'completed', 'expired']))
    )
    .addColumn('seed', 'varchar(255)', (c) => c.notNull())
    .addColumn('rules_version', 'integer', (c) => c.notNull())
    .addColumn('resolved_config', JSON_T, (c) => c.notNull())
    .addColumn('mode', 'varchar(16)', (c) => c.notNull().defaultTo('solo').check(oneOf('mode', ['solo', 'match'])))
    .addColumn('match_id', ID)
    .addColumn('metadata', JSON_T, (c) => c.notNull())
    .addColumn('expires_at', TS, (c) => c.notNull())
    .addColumn('started_at', TS)
    .addColumn('completed_at', TS)
    .addColumn('created_at', TS, (c) => c.notNull())
    .$call((t) => fk(t, 'tenant_id', 'sagegames_tenants.id', 'cascade', 'sagegames_game_sessions'))
    .$call((t) => fk(t, 'game_id', 'sagegames_games.id', 'restrict', 'sagegames_game_sessions'))
    .$call((t) => fk(t, 'match_id', 'sagegames_matches.id', 'cascade', 'sagegames_game_sessions'))
    .execute();
  await index('sagegames_game_sessions_token', 'sagegames_game_sessions', ['session_token_hash'], undefined, true);
  await index('sagegames_game_sessions_tenant_user', 'sagegames_game_sessions', ['tenant_id', 'external_user_id']);
  await index('sagegames_game_sessions_tenant_created', 'sagegames_game_sessions', ['tenant_id', 'created_at']);

  await db.schema
    .createTable('sagegames_session_logs')
    .addColumn('session_id', ID, (c) => c.primaryKey())
    .addColumn('log', JSON_T, (c) => c.notNull())
    .addColumn('log_sha256', 'varchar(64)', (c) => c.notNull())
    .addColumn('received_at', TS, (c) => c.notNull())
    .$call((t) => fk(t, 'session_id', 'sagegames_game_sessions.id', 'cascade', 'sagegames_session_logs'))
    .execute();

  // One result per session. Only status='verified' AND is_valid rows reach leaderboards.
  await db.schema
    .createTable('sagegames_game_results')
    .addColumn('id', ID, (c) => c.primaryKey())
    .addColumn('session_id', ID, (c) => c.notNull())
    .addColumn('tenant_id', ID, (c) => c.notNull())
    .addColumn('game_id', ID, (c) => c.notNull())
    .addColumn('external_user_id', ID, (c) => c.notNull())
    .addColumn('display_name', 'text')
    .addColumn('context_id', ID)
    .addColumn('status', 'varchar(16)', (c) => c.notNull().check(oneOf('status', ['verified', 'rejected', 'unverified'])))
    .addColumn('reject_code', 'varchar(64)')
    .addColumn('score', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('duration_ms', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('result', JSON_T, (c) => c.notNull())
    .addColumn('flags', JSON_T, (c) => c.notNull())
    .addColumn('is_valid', 'boolean', (c) => c.notNull())
    .addColumn('is_test', 'boolean', (c) => c.notNull().defaultTo(false))
    .addColumn('rules_version', 'integer', (c) => c.notNull())
    .addColumn('completed_at', TS, (c) => c.notNull())
    .$call((t) => fk(t, 'session_id', 'sagegames_game_sessions.id', 'cascade', 'sagegames_game_results'))
    .$call((t) => fk(t, 'tenant_id', 'sagegames_tenants.id', 'cascade', 'sagegames_game_results'))
    .$call((t) => fk(t, 'game_id', 'sagegames_games.id', 'restrict', 'sagegames_game_results'))
    .execute();
  await index('sagegames_game_results_session', 'sagegames_game_results', ['session_id'], undefined, true);
  await index('sagegames_game_results_board', 'sagegames_game_results', ['tenant_id', 'game_id', 'score'], `is_valid and status = 'verified'`);
  await index('sagegames_game_results_user', 'sagegames_game_results', ['tenant_id', 'external_user_id']);
  await index('sagegames_game_results_recent', 'sagegames_game_results', ['tenant_id', 'completed_at']);

  await db.schema
    .createTable('sagegames_player_stats')
    .addColumn('tenant_id', ID, (c) => c.notNull())
    .addColumn('external_user_id', ID, (c) => c.notNull())
    .addColumn('game_id', ID, (c) => c.notNull())
    .addColumn('games_completed', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('total_score', 'bigint', (c) => c.notNull().defaultTo(0))
    .addColumn('highest_score', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('total_play_time_ms', 'bigint', (c) => c.notNull().defaultTo(0))
    .addColumn('updated_at', TS, (c) => c.notNull())
    .addPrimaryKeyConstraint('sagegames_player_stats_pk', ['tenant_id', 'external_user_id', 'game_id'])
    .$call((t) => fk(t, 'tenant_id', 'sagegames_tenants.id', 'cascade', 'sagegames_player_stats'))
    .$call((t) => fk(t, 'game_id', 'sagegames_games.id', 'restrict', 'sagegames_player_stats'))
    .execute();

  // Per-app quiz question banks, referenced by config.bankId
  await db.schema
    .createTable('sagegames_quiz_banks')
    .addColumn('tenant_id', ID, (c) => c.notNull())
    .addColumn('bank_id', 'varchar(64)', (c) => c.notNull())
    .addColumn('name', 'varchar(255)', (c) => c.notNull().defaultTo(''))
    .addColumn('questions', JSON_T, (c) => c.notNull())
    .addColumn('created_by', ID)
    .addColumn('updated_at', TS, (c) => c.notNull())
    .addPrimaryKeyConstraint('sagegames_quiz_banks_pk', ['tenant_id', 'bank_id'])
    .$call((t) => fk(t, 'tenant_id', 'sagegames_tenants.id', 'cascade', 'sagegames_quiz_banks'))
    .$call((t) => fk(t, 'created_by', 'sagegames_users.id', 'set null', 'sagegames_quiz_banks'))
    .execute();

  // Webhook outbox, drained by the dispatcher
  await db.schema
    .createTable('sagegames_webhook_deliveries')
    .$call((t) =>
      dialect === 'postgres'
        ? t.addColumn('id', 'bigserial', (c) => c.primaryKey())
        : dialect === 'mysql'
          ? t.addColumn('id', 'bigint', (c) => c.primaryKey().autoIncrement())
          : t.addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement())
    )
    .addColumn('tenant_id', ID, (c) => c.notNull())
    .addColumn('event_type', 'varchar(64)', (c) => c.notNull())
    .addColumn('payload', JSON_T, (c) => c.notNull())
    .addColumn('status', 'varchar(16)', (c) => c.notNull().defaultTo('pending').check(oneOf('status', ['pending', 'delivered', 'failed'])))
    .addColumn('attempts', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('next_attempt_at', TS, (c) => c.notNull())
    .addColumn('last_error', 'text')
    .addColumn('created_at', TS, (c) => c.notNull())
    .addColumn('delivered_at', TS)
    .$call((t) => fk(t, 'tenant_id', 'sagegames_tenants.id', 'cascade', 'sagegames_webhook_deliveries'))
    .execute();
  await index('sagegames_webhook_deliveries_due', 'sagegames_webhook_deliveries', dialect === 'mysql' ? ['status', 'next_attempt_at'] : ['next_attempt_at'], `status = 'pending'`);
  await index('sagegames_webhook_deliveries_tenant', 'sagegames_webhook_deliveries', ['tenant_id', 'created_at']);

  await db.schema
    .createTable('sagegames_match_players')
    .addColumn('match_id', ID, (c) => c.notNull())
    .addColumn('external_user_id', ID, (c) => c.notNull())
    .addColumn('session_id', ID, (c) => c.notNull())
    .addColumn('display_name', 'text')
    .addColumn('status', 'varchar(16)', (c) =>
      c.notNull().defaultTo('invited').check(oneOf('status', ['invited', 'ready', 'playing', 'finished', 'forfeited', 'absent']))
    )
    .addColumn('rank', 'integer')
    .addColumn('score', 'integer')
    .addColumn('finished_ms', 'integer')
    .addColumn('joined_at', TS, (c) => c.notNull())
    .addPrimaryKeyConstraint('sagegames_match_players_pk', ['match_id', 'external_user_id'])
    .$call((t) => fk(t, 'match_id', 'sagegames_matches.id', 'cascade', 'sagegames_match_players'))
    .$call((t) => fk(t, 'session_id', 'sagegames_game_sessions.id', 'cascade', 'sagegames_match_players'))
    .execute();
  await index('sagegames_match_players_session', 'sagegames_match_players', ['session_id'], undefined, true);

  // Running API processes (one is expected: battle rooms are in memory)
  await db.schema
    .createTable('sagegames_instances')
    .addColumn('id', ID, (c) => c.primaryKey())
    .addColumn('started_at', TS, (c) => c.notNull())
    .addColumn('last_seen_at', TS, (c) => c.notNull())
    .execute();
}

export async function down(db: AnyDb): Promise<void> {
  for (const table of [
    'sagegames_instances',
    'sagegames_match_players',
    'sagegames_webhook_deliveries',
    'sagegames_quiz_banks',
    'sagegames_player_stats',
    'sagegames_game_results',
    'sagegames_session_logs',
    'sagegames_game_sessions',
    'sagegames_matches',
    'sagegames_tenant_game_access',
    'sagegames_games',
    'sagegames_api_keys',
    'sagegames_tenant_members',
    'sagegames_tenants',
    'sagegames_auth_tokens',
    'sagegames_refresh_tokens',
    'sagegames_users',
  ]) {
    await db.schema.dropTable(table).ifExists().execute();
  }
}
