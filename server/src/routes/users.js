'use strict';

const { Router } = require('express');
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const ctrl = require('../controllers/usersController');

const router = Router();
router.use(authenticate);

// GET /api/users/preferences
router.get('/preferences', ctrl.getPreferences);

// PUT /api/users/preferences
router.put('/preferences',
  body('mode').optional().isIn(['flash', 'interval', 'measure', 'sheet']),
  body('clef').optional().isIn(['treble', 'bass', 'both']),
  body('tier').optional().isInt({ min: 1, max: 8 }),
  body('accidentals').optional().isBoolean(),
  body('show_keyboard').optional().isBoolean(),
  body('kb_size').optional().isIn(['auto', '25', '37', '49', '61', '76', '88']),
  body('bpm').optional().isInt({ min: 40, max: 180 }),
  body('time_sig').optional().isIn(['3/4', '4/4']),
  body('interval_max').optional().isInt({ min: 2, max: 12 }),
  body('show_note_names').optional().isBoolean(),
  body('metro_volume').optional().isFloat({ min: 0, max: 1 }),
  body('metronome_enabled').optional().isBoolean(),
  body('note_sound_enabled').optional().isBoolean(),
  body('skip_count_in_on_restart').optional().isBoolean(),
  body('auto_loop_range').optional().isBoolean(),
  validate,
  ctrl.updatePreferences
);

// DELETE /api/users/account
router.delete('/account', ctrl.deleteAccount);

module.exports = router;
