/**
 * Table types for Kysely. Every table has the `sagegames_` prefix, so the platform can share a
 * database with other apps on any provider (no schema or search_path needed).
 *
 * Values as the app sees them, on every dialect (see `normalize.ts`): timestamps are `Date`,
 * booleans are `boolean`, JSON columns are parsed. JSON is always written through `json()`.
 */
import type { ColumnType, Generated } from 'kysely';

/** A UTC timestamp, always supplied by the app (never `now()` in SQL). */
export type Timestamp = ColumnType<Date, Date, Date>;
/** A JSON column: read parsed, written as a string from `json()`. */
export type Json<T> = ColumnType<T, string, string>;

export interface UsersTable {
  id: string;
  /** Stored lower-cased; unique. */
  email: string;
  /** scrypt$N$r$p$salt$hash, or null for accounts moved from the old platform (must set one). */
  password_hash: string | null;
  email_verified_at: Timestamp | null;
  /** Bumped on password change, logout everywhere and deletion: older access tokens stop working. */
  token_epoch: Generated<number>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface RefreshTokensTable {
  id: string;
  user_id: string;
  /** Tokens rotated from the same sign-in share a family; reusing a spent token revokes the family. */
  family_id: string;
  token_hash: string;
  expires_at: Timestamp;
  created_at: Timestamp;
  revoked_at: Timestamp | null;
}

export type AuthTokenPurpose = 'verify_email' | 'reset_password' | 'change_email';

export interface AuthTokensTable {
  token_hash: string;
  user_id: string;
  purpose: AuthTokenPurpose;
  /** The new address, for change_email. */
  email: string | null;
  expires_at: Timestamp;
  used_at: Timestamp | null;
  created_at: Timestamp;
}

export interface TenantsTable {
  id: string;
  name: string;
  status: Generated<'active' | 'suspended'>;
  webhook_url: string | null;
  webhook_secret: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface TenantMembersTable {
  tenant_id: string;
  user_id: string;
  role: 'owner' | 'admin';
  created_at: Timestamp;
}

export interface ApiKeysTable {
  id: string;
  tenant_id: string;
  mode: 'live' | 'test';
  key_hash: string;
  label: Generated<string>;
  created_by: string | null;
  created_at: Timestamp;
  last_used_at: Timestamp | null;
  revoked_at: Timestamp | null;
}

export interface GamesTable {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  version: string;
  category: string;
  status: string;
  delivery_model: string;
  thumbnail: string | null;
  supported_platforms: Json<string[]>;
  rules_version: number;
  updated_at: Timestamp;
}

export interface TenantGameAccessTable {
  tenant_id: string;
  game_id: string;
  is_enabled: Generated<boolean>;
  /** Default config merged under each session's config (e.g. the tenant's word list). */
  allowed_configurations: Json<Record<string, unknown>>;
}

export type SessionStatus = 'created' | 'active' | 'paused' | 'completed' | 'expired';

export interface GameSessionsTable {
  id: string;
  tenant_id: string;
  is_test: boolean;
  external_user_id: string;
  display_name: string | null;
  context_id: string | null;
  game_id: string;
  session_token_hash: string;
  status: Generated<SessionStatus>;
  seed: string;
  rules_version: number;
  resolved_config: Json<Record<string, unknown>>;
  mode: Generated<'solo' | 'match'>;
  match_id: string | null;
  metadata: Json<Record<string, unknown>>;
  expires_at: Timestamp;
  started_at: Timestamp | null;
  completed_at: Timestamp | null;
  created_at: Timestamp;
}

export interface SessionLogsTable {
  session_id: string;
  log: Json<unknown>;
  log_sha256: string;
  received_at: Timestamp;
}

export interface GameResultsTable {
  id: string;
  session_id: string;
  tenant_id: string;
  game_id: string;
  external_user_id: string;
  display_name: string | null;
  context_id: string | null;
  status: 'verified' | 'rejected' | 'unverified';
  reject_code: string | null;
  score: number;
  duration_ms: number;
  result: Json<unknown>;
  flags: Json<string[]>;
  is_valid: boolean;
  is_test: boolean;
  rules_version: number;
  completed_at: Timestamp;
}

export interface PlayerStatsTable {
  tenant_id: string;
  external_user_id: string;
  game_id: string;
  games_completed: number;
  total_score: number;
  highest_score: number;
  total_play_time_ms: number;
  updated_at: Timestamp;
}

export interface QuizBanksTable {
  tenant_id: string;
  bank_id: string;
  name: string;
  questions: Json<unknown[]>;
  created_by: string | null;
  updated_at: Timestamp;
}

export interface WebhookDeliveriesTable {
  id: Generated<number>;
  tenant_id: string;
  event_type: string;
  payload: Json<unknown>;
  status: Generated<'pending' | 'delivered' | 'failed'>;
  attempts: Generated<number>;
  next_attempt_at: Timestamp;
  last_error: string | null;
  created_at: Timestamp;
  delivered_at: Timestamp | null;
}

export type MatchStatusValue = 'lobby' | 'countdown' | 'in_progress' | 'finished' | 'cancelled' | 'aborted';

export interface MatchesTable {
  id: string;
  tenant_id: string;
  game_id: string;
  is_test: boolean;
  context_id: string | null;
  seed: string;
  rules_version: number;
  resolved_config: Json<Record<string, unknown>>;
  status: Generated<MatchStatusValue>;
  min_players: number;
  max_players: number;
  /** Group matches let chat members join while the lobby is open. */
  allow_join: boolean;
  lobby_expires_at: Timestamp;
  started_at: Timestamp | null;
  finished_at: Timestamp | null;
  standings: Json<unknown> | null;
  created_at: Timestamp;
}

export interface MatchPlayersTable {
  match_id: string;
  external_user_id: string;
  /** Each player plays through their own session (mode = 'match'), which holds their token. */
  session_id: string;
  display_name: string | null;
  status: Generated<'invited' | 'ready' | 'playing' | 'finished' | 'forfeited' | 'absent'>;
  rank: number | null;
  score: number | null;
  finished_ms: number | null;
  joined_at: Timestamp;
}

/** Running API processes, to warn when more than one serves the same database (battles are in memory). */
export interface InstancesTable {
  id: string;
  started_at: Timestamp;
  last_seen_at: Timestamp;
}

export interface Database {
  sagegames_users: UsersTable;
  sagegames_refresh_tokens: RefreshTokensTable;
  sagegames_auth_tokens: AuthTokensTable;
  sagegames_tenants: TenantsTable;
  sagegames_tenant_members: TenantMembersTable;
  sagegames_api_keys: ApiKeysTable;
  sagegames_games: GamesTable;
  sagegames_tenant_game_access: TenantGameAccessTable;
  sagegames_game_sessions: GameSessionsTable;
  sagegames_session_logs: SessionLogsTable;
  sagegames_game_results: GameResultsTable;
  sagegames_player_stats: PlayerStatsTable;
  sagegames_quiz_banks: QuizBanksTable;
  sagegames_webhook_deliveries: WebhookDeliveriesTable;
  sagegames_matches: MatchesTable;
  sagegames_match_players: MatchPlayersTable;
  sagegames_instances: InstancesTable;
}
