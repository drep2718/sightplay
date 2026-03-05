'use strict';

const { query } = require('../config/database');

const MAX_PIECES     = 50;
const MAX_FILE_BYTES = 1.5 * 1024 * 1024; // 1.5 MB

async function listPieces(userId) {
  const { rows } = await query(
    `SELECT id, title, file_type, tempo, time_sig, total_cols,
            has_both_staves, is_favorite, last_played_at, play_count, created_at
     FROM pieces
     WHERE user_id = $1
     ORDER BY is_favorite DESC, last_played_at DESC NULLS LAST, created_at DESC`,
    [userId]
  );
  return rows;
}

async function savePiece(userId, { title, file_type, file_content, tempo, time_sig, total_cols, has_both_staves }) {
  if (!title || !file_type || !file_content) {
    throw Object.assign(new Error('title, file_type, and file_content are required'), { status: 400 });
  }

  const byteLen = Buffer.byteLength(file_content, 'utf8');
  if (byteLen > MAX_FILE_BYTES) {
    throw Object.assign(new Error('File too large (max 1.5 MB)'), { status: 413 });
  }

  // Check piece count limit
  const { rows: countRows } = await query(
    'SELECT COUNT(*) AS cnt FROM pieces WHERE user_id = $1',
    [userId]
  );
  if (parseInt(countRows[0].cnt) >= MAX_PIECES) {
    throw Object.assign(new Error(`Piece library is full (max ${MAX_PIECES} pieces)`), { status: 422 });
  }

  // Upsert by (user_id, title)
  const { rows } = await query(
    `INSERT INTO pieces (user_id, title, file_type, file_content, tempo, time_sig, total_cols, has_both_staves)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id, title) DO UPDATE SET
       file_type       = EXCLUDED.file_type,
       file_content    = EXCLUDED.file_content,
       tempo           = EXCLUDED.tempo,
       time_sig        = EXCLUDED.time_sig,
       total_cols      = EXCLUDED.total_cols,
       has_both_staves = EXCLUDED.has_both_staves
     RETURNING id, title, file_type, tempo, time_sig, total_cols, has_both_staves, is_favorite, created_at`,
    [userId, title, file_type, file_content,
     tempo ?? null, time_sig ?? null, total_cols ?? null, has_both_staves ?? false]
  );
  return rows[0];
}

async function getPieceContent(userId, pieceId) {
  const { rows } = await query(
    'SELECT id, title, file_type, file_content FROM pieces WHERE id = $1 AND user_id = $2',
    [pieceId, userId]
  );
  if (!rows.length) throw Object.assign(new Error('Piece not found'), { status: 404 });
  return rows[0];
}

async function toggleFavorite(userId, pieceId) {
  const { rows } = await query(
    `UPDATE pieces SET is_favorite = NOT is_favorite
     WHERE id = $1 AND user_id = $2
     RETURNING id, is_favorite`,
    [pieceId, userId]
  );
  if (!rows.length) throw Object.assign(new Error('Piece not found'), { status: 404 });
  return rows[0];
}

async function renamePiece(userId, pieceId, newTitle) {
  const { rows } = await query(
    `UPDATE pieces SET title = $3
     WHERE id = $1 AND user_id = $2
     RETURNING id, title`,
    [pieceId, userId, newTitle]
  );
  if (!rows.length) throw Object.assign(new Error('Piece not found'), { status: 404 });
  return rows[0];
}

async function deletePiece(userId, pieceId) {
  const { rowCount } = await query(
    'DELETE FROM pieces WHERE id = $1 AND user_id = $2',
    [pieceId, userId]
  );
  if (!rowCount) throw Object.assign(new Error('Piece not found'), { status: 404 });
}

async function markPlayed(userId, pieceId) {
  const { rows } = await query(
    `UPDATE pieces
     SET last_played_at = NOW(), play_count = play_count + 1
     WHERE id = $1 AND user_id = $2
     RETURNING id, play_count, last_played_at`,
    [pieceId, userId]
  );
  if (!rows.length) throw Object.assign(new Error('Piece not found'), { status: 404 });
  return rows[0];
}

module.exports = { listPieces, savePiece, getPieceContent, toggleFavorite, renamePiece, deletePiece, markPlayed };
