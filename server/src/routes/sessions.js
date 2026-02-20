'use strict';

const { Router } = require('express');
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const ctrl = require('../controllers/sessionsController');

const router = Router();
router.use(authenticate);

// POST /api/sessions — create on Start
router.post('/',
  body('mode').isIn(['flash', 'interval', 'measure', 'sheet']),
  body('clef').isIn(['treble', 'bass', 'both']),
  body('tier').isInt({ min: 1, max: 8 }),
  body('accidentals').isBoolean(),
  validate,
  ctrl.createSession
);

// PATCH /api/sessions/:id — update in progress
router.patch('/:id',
  body('total_attempts').optional().isInt({ min: 0 }),
  body('total_correct').optional().isInt({ min: 0 }),
  body('best_reaction').optional({ nullable: true }).isInt({ min: 0 }),
  body('avg_reaction').optional({ nullable: true }).isInt({ min: 0 }),
  body('reaction_times').optional().isArray(),
  validate,
  ctrl.updateSession
);

// POST /api/sessions/:id/end — close on Stop
router.post('/:id/end',
  body('total_attempts').optional().isInt({ min: 0 }),
  body('total_correct').optional().isInt({ min: 0 }),
  body('best_reaction').optional({ nullable: true }).isInt({ min: 0 }),
  body('avg_reaction').optional({ nullable: true }).isInt({ min: 0 }),
  body('reaction_times').optional().isArray(),
  validate,
  ctrl.endSession
);

// GET /api/sessions — paginated list
router.get('/', ctrl.listSessions);

module.exports = router;
