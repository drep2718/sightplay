'use strict';

const { query, withTransaction } = require('../config/database');

async function getUserById(userId) {
  const { rows } = await query(
    `SELECT id, email, display_name, avatar_url, role, auth_provider,
            migrated_local_storage, is_active, created_at
     FROM users WHERE id = $1 AND is_active = TRUE`,
    [userId]
  );
  return rows[0] || null;
}

async function getPreferences(userId) {
  const { rows } = await query(
    `SELECT mode, clef, tier, accidentals, show_keyboard, kb_size,
            bpm, time_sig, interval_max
     FROM user_preferences WHERE user_id = $1`,
    [userId]
  );
  return rows[0] || null;
}

async function updatePreferences(userId, prefs) {
  const {
    mode, clef, tier, accidentals, show_keyboard,
    kb_size, bpm, time_sig, interval_max,
  } = prefs;

  await query(
    `UPDATE user_preferences
     SET mode = COALESCE($2, mode),
         clef = COALESCE($3, clef),
         tier = COALESCE($4, tier),
         accidentals = COALESCE($5, accidentals),
         show_keyboard = COALESCE($6, show_keyboard),
         kb_size = COALESCE($7, kb_size),
         bpm = COALESCE($8, bpm),
         time_sig = COALESCE($9, time_sig),
         interval_max = COALESCE($10, interval_max)
     WHERE user_id = $1`,
    [userId, mode, clef, tier, accidentals, show_keyboard, kb_size, bpm, time_sig, interval_max]
  );
}

async function deleteAccount(userId) {
  // Cascades to preferences, stats, sessions, refresh_tokens
  await query('UPDATE users SET is_active = FALSE WHERE id = $1', [userId]);
}

module.exports = { getUserById, getPreferences, updatePreferences, deleteAccount };
