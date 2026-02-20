'use strict';

const { validationResult } = require('express-validator');

/**
 * Run after express-validator chains.
 * Returns 422 with the first validation error if any exist.
 */
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const first = errors.array()[0];
    return res.status(422).json({ error: first.msg, field: first.path });
  }
  next();
}

module.exports = { validate };
