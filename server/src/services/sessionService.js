'use strict';

const { query } = require('../config/database');

async function createSession(userId, settings) {
  const {
    mode, clef, tier, accidentals, bpm, time_sig, interval_max,
    sheet_filename, sheet_tempo, sheet_total_cols,
  } = settings;

  const { rows } = await query(
    `INSERT INTO sessions
       (user_id, mode, clef, tier, accidentals, bpm, time_sig, interval_max,
        sheet_filename, sheet_tempo, sheet_total_cols)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id, started_at`,
    [userId, mode, clef, tier, accidentals, bpm || null, time_sig || null,
     interval_max || null, sheet_filename || null, sheet_tempo || null,
     sheet_total_cols || null]
  );
  return rows[0];
}

async function updateSession(sessionId, userId, data) {
  const { total_attempts, total_correct, best_reaction, avg_reaction, reaction_times } = data;

  const { rowCount } = await query(
    `UPDATE sessions
     SET total_attempts = COALESCE($3, total_attempts),
         total_correct  = COALESCE($4, total_correct),
         best_reaction  = COALESCE($5, best_reaction),
         avg_reaction   = COALESCE($6, avg_reaction),
         reaction_times = COALESCE($7, reaction_times)
     WHERE id = $1 AND user_id = $2 AND ended_at IS NULL`,
    [sessionId, userId, total_attempts, total_correct, best_reaction, avg_reaction,
     reaction_times ? JSON.stringify(reaction_times) : null]
  );

  if (!rowCount) {
    const err = new Error('Session not found or already ended');
    err.statusCode = 404;
    throw err;
  }
}

async function endSession(sessionId, userId, finalData) {
  const { total_attempts, total_correct, best_reaction, avg_reaction, reaction_times } = finalData;

  const { rowCount } = await query(
    `UPDATE sessions
     SET ended_at       = NOW(),
         total_attempts = COALESCE($3, total_attempts),
         total_correct  = COALESCE($4, total_correct),
         best_reaction  = COALESCE($5, best_reaction),
         avg_reaction   = COALESCE($6, avg_reaction),
         reaction_times = COALESCE($7, reaction_times)
     WHERE id = $1 AND user_id = $2 AND ended_at IS NULL`,
    [sessionId, userId, total_attempts, total_correct, best_reaction, avg_reaction,
     reaction_times ? JSON.stringify(reaction_times) : null]
  );

  if (!rowCount) {
    const err = new Error('Session not found or already ended');
    err.statusCode = 404;
    throw err;
  }
}

async function listSessions(userId, { page = 1, limit = 20 } = {}) {
  const offset = (page - 1) * limit;
  const { rows } = await query(
    `SELECT id, mode, clef, tier, started_at, ended_at,
            total_attempts, total_correct, best_reaction, avg_reaction
     FROM sessions
     WHERE user_id = $1
     ORDER BY started_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  const { rows: countRows } = await query(
    'SELECT COUNT(*) FROM sessions WHERE user_id = $1',
    [userId]
  );

  return {
    sessions: rows,
    total: parseInt(countRows[0].count, 10),
    page,
    limit,
  };
}

module.exports = { createSession, updateSession, endSession, listSessions };
