'use strict';

const { query } = require('../config/database');

async function getStats(userId) {
  const { rows } = await query(
    `SELECT total_attempts, total_correct, best_reaction, reaction_times, updated_at
     FROM all_time_stats WHERE user_id = $1`,
    [userId]
  );
  return rows[0] || null;
}

/**
 * One-time localStorage migration import.
 * If DB has no attempts, does a full replace.
 * If DB already has data, merges conservatively.
 */
async function migrateLocalStorage(userId, { ta, tc, br, rt }) {
  const { rows } = await query(
    'SELECT total_attempts, total_correct, best_reaction, reaction_times FROM all_time_stats WHERE user_id = $1',
    [userId]
  );

  // Check if already migrated
  const { rows: userRows } = await query(
    'SELECT migrated_local_storage FROM users WHERE id = $1',
    [userId]
  );
  if (userRows[0]?.migrated_local_storage) {
    const err = new Error('Already migrated');
    err.statusCode = 409;
    throw err;
  }

  const current = rows[0];
  let newTa, newTc, newBr, newRt;

  if (!current || current.total_attempts === 0) {
    // Full replace
    newTa = ta || 0;
    newTc = tc || 0;
    newBr = br || null;
    newRt = (rt || []).slice(-100);
  } else {
    // Merge
    newTa = Math.max(current.total_attempts, ta || 0);
    newTc = Math.max(current.total_correct, tc || 0);
    newBr = current.best_reaction && br
      ? Math.min(current.best_reaction, br)
      : current.best_reaction || br || null;
    const combined = [...(current.reaction_times || []), ...(rt || [])];
    newRt = combined.slice(-100);
  }

  await query(
    `UPDATE all_time_stats
     SET total_attempts = $2, total_correct = $3, best_reaction = $4, reaction_times = $5
     WHERE user_id = $1`,
    [userId, newTa, newTc, newBr, JSON.stringify(newRt)]
  );

  await query(
    'UPDATE users SET migrated_local_storage = TRUE WHERE id = $1',
    [userId]
  );
}

/**
 * Record a single attempt on the hot path.
 */
async function recordAttempt(userId, { correct, reactionTimeMs }) {
  if (correct && reactionTimeMs != null) {
    await query(
      `UPDATE all_time_stats
       SET total_attempts = total_attempts + 1,
           total_correct  = total_correct + 1,
           best_reaction  = CASE
             WHEN best_reaction IS NULL THEN $2
             WHEN $2 < best_reaction   THEN $2
             ELSE best_reaction
           END,
           reaction_times = (
             SELECT jsonb_agg(v)
             FROM (
               SELECT value AS v FROM jsonb_array_elements(reaction_times)
               UNION ALL SELECT to_jsonb($2::int)
             ) t
             ORDER BY (SELECT COUNT(*) FROM jsonb_array_elements(reaction_times)) DESC
             LIMIT 100
           )
       WHERE user_id = $1`,
      [userId, reactionTimeMs]
    );
  } else {
    const increment = correct ? 1 : 0;
    await query(
      `UPDATE all_time_stats
       SET total_attempts = total_attempts + 1,
           total_correct  = total_correct + $2
       WHERE user_id = $1`,
      [userId, increment]
    );
  }
}

module.exports = { getStats, migrateLocalStorage, recordAttempt };
