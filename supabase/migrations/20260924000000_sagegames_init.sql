-- SageGames platform schema.
--
-- Everything lives in the `sagegames` schema so it can share a Supabase project without clashing
-- with other tables, and so Supabase's Data API (which exposes `public`) cannot reach it. Only the
-- platform API, connecting as the database owner, reads and writes these tables. RLS is enabled
-- with no policies as a second layer: anon/authenticated roles get nothing even if exposed later.
--
-- Portal accounts are Supabase Auth users (auth.users); tenant_members links them to tenants.

CREATE SCHEMA IF NOT EXISTS sagegames;
REVOKE ALL ON SCHEMA sagegames FROM PUBLIC;
REVOKE ALL ON SCHEMA sagegames FROM anon, authenticated;
SET search_path TO sagegames;

-- Tenants are host apps (e.g. Japabudz)
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

-- Host API keys: sk_<mode>_<id>_<secret>. Only an HMAC of the secret is stored.
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

-- Game catalog (synced from code when the API starts)
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
  -- Default config merged under each session's config (e.g. the tenant's word list)
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

-- One result per session. Only status='verified' AND is_valid rows reach leaderboards.
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

-- Per-tenant quiz question banks, referenced by config.bankId
CREATE TABLE quiz_banks (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bank_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  questions JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, bank_id)
);

-- Webhook outbox, drained by the dispatcher
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

-- Defence in depth: RLS on, no policies.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_game_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
