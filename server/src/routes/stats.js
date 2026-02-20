'use strict';

const { Router } = require('express');
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const ctrl = require('../controllers/statsController');

const router = Router();
router.use(authenticate);

// GET /api/stats
router.get('/', ctrl.getStats);

// PUT /api/stats — one-time localStorage migration
router.put('/',
  body('ta').isInt({ min: 0 }),
  body('tc').isInt({ min: 0 }),
  body('br').optional({ nullable: true }).isInt({ min: 0 }),
  body('rt').optional().isArray(),
  validate,
  ctrl.migrateStats
);

// PATCH /api/stats/attempt — hot path, record one attempt
router.patch('/attempt',
  body('correct').isBoolean(),
  body('reactionTimeMs').optional({ nullable: true }).isInt({ min: 0, max: 60000 }),
  validate,
  ctrl.recordAttempt
);

module.exports = router;
