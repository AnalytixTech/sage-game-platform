-- ============================================================================
-- SageGame Platform Database Schema (PostgreSQL)
-- Multi-Tenant, Multi-Game Architecture
-- ============================================================================

-- 1. Tenants (Host Applications / Third-party Clients)
CREATE TABLE tenants (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(128) UNIQUE NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    webhook_secret VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Applications (Tenants can own multiple web/mobile apps)
CREATE TABLE applications (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    platform VARCHAR(32) NOT NULL, -- 'web', 'ios', 'android'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Host API Keys (Host Backend Secret Credentials)
CREATE TABLE api_keys (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key_hash VARCHAR(255) UNIQUE NOT NULL,
    label VARCHAR(128),
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. External Users (Host App's Users mapped to Tenant)
CREATE TABLE external_users (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    external_user_id VARCHAR(255) NOT NULL,
    username VARCHAR(128),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, external_user_id)
);

-- 5. Central Game Registry
CREATE TABLE games (
    id VARCHAR(64) PRIMARY KEY,
    slug VARCHAR(128) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    version VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    category VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'published',
    delivery_model VARCHAR(32) NOT NULL DEFAULT 'sdk_rendered',
    remote_url TEXT,
    thumbnail TEXT,
    icon TEXT,
    supported_platforms TEXT[] NOT NULL DEFAULT '{"web","ios","android"}',
    configuration JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Game Versions (Version history & rollback support)
CREATE TABLE game_versions (
    id VARCHAR(64) PRIMARY KEY,
    game_id VARCHAR(64) NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    version VARCHAR(32) NOT NULL,
    bundle_url TEXT,
    changelog TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(game_id, version)
);

-- 7. Tenant Game Access Control (Enables specific games per Tenant)
CREATE TABLE tenant_game_access (
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    game_id VARCHAR(64) NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    is_enabled BOOLEAN DEFAULT TRUE,
    allowed_configurations JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, game_id)
);

-- 8. Game Sessions
CREATE TABLE game_sessions (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    external_user_id VARCHAR(255) NOT NULL,
    game_id VARCHAR(64) NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    session_token VARCHAR(512) UNIQUE NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'created',
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    config_override JSONB DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. Game Events (Telemetry & Audit log)
CREATE TABLE game_events (
    id BIGSERIAL PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
    tenant_id VARCHAR(64) NOT NULL,
    game_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. Game Results (Authoritative Server Validated Scores)
CREATE TABLE game_results (
    id VARCHAR(64) PRIMARY KEY,
    session_id VARCHAR(64) UNIQUE NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    external_user_id VARCHAR(255) NOT NULL,
    game_id VARCHAR(64) NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    score INT NOT NULL DEFAULT 0,
    duration_seconds INT NOT NULL DEFAULT 0,
    game_data JSONB DEFAULT '{}'::jsonb,
    is_valid BOOLEAN DEFAULT TRUE,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. Player Statistics (Overall & Per Game)
CREATE TABLE player_stats (
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    external_user_id VARCHAR(255) NOT NULL,
    game_id VARCHAR(64) NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    games_played INT NOT NULL DEFAULT 0,
    games_completed INT NOT NULL DEFAULT 0,
    total_score BIGINT NOT NULL DEFAULT 0,
    highest_score INT NOT NULL DEFAULT 0,
    total_play_time_seconds INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, external_user_id, game_id)
);

-- 12. Leaderboards & Entries
CREATE TABLE leaderboards (
    id VARCHAR(64) PRIMARY KEY,
    game_id VARCHAR(64) REFERENCES games(id) ON DELETE CASCADE,
    tenant_id VARCHAR(64) REFERENCES tenants(id) ON DELETE CASCADE,
    period VARCHAR(32) NOT NULL DEFAULT 'all_time', -- 'all_time', 'daily', 'weekly', 'monthly'
    scope VARCHAR(32) NOT NULL DEFAULT 'global',   -- 'global', 'tenant', 'game'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE leaderboard_entries (
    id VARCHAR(64) PRIMARY KEY,
    leaderboard_id VARCHAR(64) NOT NULL REFERENCES leaderboards(id) ON DELETE CASCADE,
    tenant_id VARCHAR(64) NOT NULL,
    external_user_id VARCHAR(255) NOT NULL,
    game_id VARCHAR(64) NOT NULL,
    score INT NOT NULL,
    achieved_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(leaderboard_id, tenant_id, external_user_id)
);

-- 13. Webhook Dispatch Queue
CREATE TABLE webhooks (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    event_type VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    signature VARCHAR(255) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    attempts INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance & isolation
CREATE INDEX idx_game_sessions_tenant_user ON game_sessions(tenant_id, external_user_id);
CREATE INDEX idx_game_results_tenant_game ON game_results(tenant_id, game_id);
CREATE INDEX idx_leaderboard_entries_score ON leaderboard_entries(leaderboard_id, score DESC);
