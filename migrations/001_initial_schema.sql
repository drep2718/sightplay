-- ─────────────────────────────────────────────────────────────
-- MicroSight — Initial Schema
-- ─────────────────────────────────────────────────────────────

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";

-- Enum types
CREATE TYPE user_role AS ENUM ('user', 'admin');
CREATE TYPE auth_provider AS ENUM ('local', 'google');

-- ─── users ───────────────────────────────────────────────────
CREATE TABLE users (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email                  CITEXT UNIQUE NOT NULL,
  password_hash          TEXT,
  google_id              TEXT UNIQUE,
  display_name           TEXT,
  avatar_url             TEXT,
  role                   user_role NOT NULL DEFAULT 'user',
  auth_provider          auth_provider NOT NULL,
  migrated_local_storage BOOLEAN NOT NULL DEFAULT FALSE,
  is_active              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_password_or_google
    CHECK (auth_provider = 'google' OR password_hash IS NOT NULL)
);

CREATE INDEX idx_users_email     ON users (email);
CREATE INDEX idx_users_google_id ON users (google_id) WHERE google_id IS NOT NULL;
CREATE INDEX idx_users_role      ON users (role);

-- ─── refresh_tokens ──────────────────────────────────────────
CREATE TABLE refresh_tokens (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT UNIQUE NOT NULL,
  family_id    UUID NOT NULL,
  is_valid     BOOLEAN NOT NULL DEFAULT TRUE,
  issued_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,
  user_agent   TEXT,
  ip_address   INET
);

CREATE INDEX idx_refresh_tokens_hash      ON refresh_tokens (token_hash);
CREATE INDEX idx_refresh_tokens_family    ON refresh_tokens (family_id);
CREATE INDEX idx_refresh_tokens_user      ON refresh_tokens (user_id);

-- ─── user_preferences ────────────────────────────────────────
CREATE TABLE user_preferences (
  user_id      UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mode         TEXT NOT NULL DEFAULT 'flash',
  clef         TEXT NOT NULL DEFAULT 'treble',
  tier         SMALLINT NOT NULL DEFAULT 1 CHECK (tier BETWEEN 1 AND 8),
  accidentals  BOOLEAN NOT NULL DEFAULT FALSE,
  show_keyboard BOOLEAN NOT NULL DEFAULT TRUE,
  kb_size      TEXT NOT NULL DEFAULT 'auto',
  bpm          SMALLINT NOT NULL DEFAULT 80 CHECK (bpm BETWEEN 40 AND 180),
  time_sig     TEXT NOT NULL DEFAULT '4/4',
  interval_max SMALLINT NOT NULL DEFAULT 8 CHECK (interval_max BETWEEN 2 AND 12),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── all_time_stats ──────────────────────────────────────────
CREATE TABLE all_time_stats (
  user_id        UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_attempts INT NOT NULL DEFAULT 0,
  total_correct  INT NOT NULL DEFAULT 0,
  best_reaction  INT,
  reaction_times JSONB NOT NULL DEFAULT '[]',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_correct_le_attempts
    CHECK (total_correct <= total_attempts)
);

-- ─── sessions ────────────────────────────────────────────────
CREATE TABLE sessions (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode             TEXT NOT NULL,
  clef             TEXT NOT NULL,
  tier             SMALLINT NOT NULL,
  accidentals      BOOLEAN NOT NULL,
  bpm              SMALLINT,
  time_sig         TEXT,
  interval_max     SMALLINT,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at         TIMESTAMPTZ,
  total_attempts   INT NOT NULL DEFAULT 0,
  total_correct    INT NOT NULL DEFAULT 0,
  best_reaction    INT,
  avg_reaction     INT,
  reaction_times   JSONB NOT NULL DEFAULT '[]',
  sheet_filename   TEXT,
  sheet_tempo      SMALLINT,
  sheet_total_cols INT,

  CONSTRAINT chk_session_correct_le_attempts
    CHECK (total_correct <= total_attempts)
);

CREATE INDEX idx_sessions_user_id   ON sessions (user_id);
CREATE INDEX idx_sessions_started   ON sessions (started_at DESC);

-- ─── auto-update updated_at ──────────────────────────────────
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_users
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_preferences
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_stats
  BEFORE UPDATE ON all_time_stats
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ─── guard: prevent removing last admin ──────────────────────
CREATE OR REPLACE FUNCTION guard_last_admin()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.role = 'admin' AND NEW.role != 'admin' THEN
    IF (SELECT COUNT(*) FROM users WHERE role = 'admin' AND id != OLD.id) = 0 THEN
      RAISE EXCEPTION 'Cannot demote the last admin account';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER guard_last_admin_trigger
  BEFORE UPDATE OF role ON users
  FOR EACH ROW EXECUTE FUNCTION guard_last_admin();
