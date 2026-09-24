-- Online battles: 2+ players race on the same puzzle (same seed and config).
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
  -- Group matches let chat members join while the lobby is open.
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
  -- Each player plays through their own session (mode = 'match'), which holds their token.
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

ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_players ENABLE ROW LEVEL SECURITY;
