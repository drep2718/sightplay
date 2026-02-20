'use strict';

const statsService = require('../services/statsService');

async function getStats(req, res, next) {
  try {
    const stats = await statsService.getStats(req.user.id);
    if (!stats) return res.status(404).json({ error: 'Stats not found' });
    res.json({ stats });
  } catch (err) {
    next(err);
  }
}

async function migrateStats(req, res, next) {
  try {
    await statsService.migrateLocalStorage(req.user.id, req.body);
    res.json({ message: 'Stats migrated' });
  } catch (err) {
    next(err);
  }
}

async function recordAttempt(req, res, next) {
  try {
    await statsService.recordAttempt(req.user.id, req.body);
    res.json({ message: 'Attempt recorded' });
  } catch (err) {
    next(err);
  }
}

module.exports = { getStats, migrateStats, recordAttempt };
