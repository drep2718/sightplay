-- Migration 004: add skip_count_in_on_restart preference
-- Run manually: docker compose exec postgres psql -U postgres -d microsight -f /docker-entrypoint-initdb.d/004_skip_count_in.sql

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS skip_count_in_on_restart BOOLEAN NOT NULL DEFAULT FALSE;
