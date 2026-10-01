-- The 2.x platform schema (Postgres, `sagegames` schema), for testing the export to 3.0.
-- Portal accounts lived in a separate auth.users table.
CREATE SCHEMA auth;
CREATE TABLE auth.users (id UUID PRIMARY KEY, email TEXT, email_confirmed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now());
CREATE SCHEMA IF NOT EXISTS sagegames;

SET search_path TO sagegames;

CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  webhook_url TEXT,
  webhook_secret TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tenant_members (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);
CREATE INDEX tenant_members_user ON tenant_members (user_id);

CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('live', 'test')),
  key_hash TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX api_keys_tenant ON api_keys (tenant_id);

CREATE TABLE games (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  version TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published',
  delivery_model TEXT NOT NULL DEFAULT 'sdk_rendered',
  thumbnail TEXT,
  supported_platforms TEXT[] NOT NULL DEFAULT '{web,ios,android}',
  rules_version INT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tenant_game_access (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  allowed_configurations JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (tenant_id, game_id)
);

CREATE TABLE game_sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  is_test BOOLEAN NOT NULL DEFAULT FALSE,
  external_user_id TEXT NOT NULL,
  display_name TEXT,
  context_id TEXT,
  game_id TEXT NOT NULL REFERENCES games(id),
  session_token_hash TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'active', 'paused', 'completed', 'expired')),
  seed TEXT NOT NULL,
  rules_version INT NOT NULL,
  resolved_config JSONB NOT NULL,
  mode TEXT NOT NULL DEFAULT 'solo' CHECK (mode IN ('solo', 'match')),
  match_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX game_sessions_tenant_user ON game_sessions (tenant_id, external_user_id);
CREATE INDEX game_sessions_tenant_created ON game_sessions (tenant_id, created_at);

CREATE TABLE session_logs (
  session_id TEXT PRIMARY KEY REFERENCES game_sessions(id) ON DELETE CASCADE,
  log JSONB NOT NULL,
  log_sha256 TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE game_results (
  id TEXT PRIMARY KEY,
  session_id TEXT UNIQUE NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL REFERENCES games(id),
  external_user_id TEXT NOT NULL,
  display_name TEXT,
  context_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('verified', 'rejected', 'unverified')),
  reject_code TEXT,
  score INT NOT NULL DEFAULT 0,
  duration_ms INT NOT NULL DEFAULT 0,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_valid BOOLEAN NOT NULL,
  is_test BOOLEAN NOT NULL DEFAULT FALSE,
  rules_version INT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX game_results_board ON game_results (tenant_id, game_id, score DESC)
  WHERE is_valid AND status = 'verified';
CREATE INDEX game_results_user ON game_results (tenant_id, external_user_id);

CREATE TABLE player_stats (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  external_user_id TEXT NOT NULL,
  game_id TEXT NOT NULL REFERENCES games(id),
  games_completed INT NOT NULL DEFAULT 0,
  total_score BIGINT NOT NULL DEFAULT 0,
  highest_score INT NOT NULL DEFAULT 0,
  total_play_time_ms BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, external_user_id, game_id)
);

CREATE TABLE quiz_banks (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bank_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  questions JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, bank_id)
);

CREATE TABLE webhook_deliveries (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
  attempts INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ
);
CREATE INDEX webhook_deliveries_due ON webhook_deliveries (next_attempt_at) WHERE status = 'pending';

SET search_path TO sagegames;

CREATE TABLE matches (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL REFERENCES games(id),
  is_test BOOLEAN NOT NULL DEFAULT FALSE,
  context_id TEXT,
  seed TEXT NOT NULL,
  rules_version INT NOT NULL,
  resolved_config JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'lobby'
    CHECK (status IN ('lobby', 'countdown', 'in_progress', 'finished', 'cancelled', 'aborted')),
  min_players INT NOT NULL DEFAULT 2,
  max_players INT NOT NULL DEFAULT 8,
  allow_join BOOLEAN NOT NULL DEFAULT FALSE,
  lobby_expires_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  standings JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX matches_tenant_created ON matches (tenant_id, created_at);
CREATE INDEX matches_active ON matches (status) WHERE status IN ('lobby', 'countdown', 'in_progress');

CREATE TABLE match_players (
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  external_user_id TEXT NOT NULL,
  session_id TEXT NOT NULL UNIQUE REFERENCES game_sessions(id) ON DELETE CASCADE,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited', 'ready', 'playing', 'finished', 'forfeited', 'absent')),
  rank INT,
  score INT,
  finished_ms INT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, external_user_id)
);

ALTER TABLE game_sessions
  ADD CONSTRAINT game_sessions_match_fk FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE;

