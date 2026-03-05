-- Migration 003: add show_note_names, metro_volume, metronome_enabled, note_sound_enabled
-- Run manually: docker compose exec postgres psql -U postgres -d microsight -f /docker-entrypoint-initdb.d/003_extra_prefs.sql

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS show_note_names    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS metro_volume       REAL    NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS metronome_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS note_sound_enabled BOOLEAN NOT NULL DEFAULT TRUE;
