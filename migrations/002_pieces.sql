-- Migration 002: Piece Library

CREATE TABLE IF NOT EXISTS pieces (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  file_type       TEXT NOT NULL CHECK (file_type IN ('xml', 'midi')),
  file_content    TEXT NOT NULL,
  tempo           SMALLINT,
  time_sig        TEXT,
  total_cols      INT,
  has_both_staves BOOLEAN NOT NULL DEFAULT FALSE,
  is_favorite     BOOLEAN NOT NULL DEFAULT FALSE,
  last_played_at  TIMESTAMPTZ,
  play_count      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pieces_user_title ON pieces (user_id, title);
CREATE INDEX IF NOT EXISTS idx_pieces_user ON pieces (user_id);
CREATE INDEX IF NOT EXISTS idx_pieces_fav  ON pieces (user_id, is_favorite);
