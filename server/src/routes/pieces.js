'use strict';

const { Router }  = require('express');
const { body, param } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { validate }     = require('../middleware/validate');
const ctrl = require('../controllers/piecesController');

const router = Router();
router.use(authenticate);

// GET /api/pieces
router.get('/', ctrl.list);

// POST /api/pieces — save new piece (or upsert by title)
router.post('/',
  body('title').isString().trim().notEmpty().isLength({ max: 200 }),
  body('file_type').isIn(['xml', 'midi']),
  body('file_content').isString().notEmpty(),
  body('tempo').optional({ nullable: true }).isInt({ min: 1, max: 500 }),
  body('time_sig').optional({ nullable: true }).isString(),
  body('total_cols').optional({ nullable: true }).isInt({ min: 0 }),
  body('has_both_staves').optional().isBoolean(),
  validate,
  ctrl.save
);

// GET /api/pieces/:id — fetch full content for loading
router.get('/:id',
  param('id').isUUID(),
  validate,
  ctrl.getContent
);

// PATCH /api/pieces/:id/favorite — toggle is_favorite
router.patch('/:id/favorite',
  param('id').isUUID(),
  validate,
  ctrl.favorite
);

// DELETE /api/pieces/:id
router.delete('/:id',
  param('id').isUUID(),
  validate,
  ctrl.remove
);

// PATCH /api/pieces/:id/played — update last_played_at + play_count
router.patch('/:id/played',
  param('id').isUUID(),
  validate,
  ctrl.played
);

module.exports = router;
