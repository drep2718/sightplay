'use strict';

const sessionService = require('../services/sessionService');

async function createSession(req, res, next) {
  try {
    const session = await sessionService.createSession(req.user.id, req.body);
    res.status(201).json({ session });
  } catch (err) {
    next(err);
  }
}

async function updateSession(req, res, next) {
  try {
    await sessionService.updateSession(req.params.id, req.user.id, req.body);
    res.json({ message: 'Session updated' });
  } catch (err) {
    next(err);
  }
}

async function endSession(req, res, next) {
  try {
    await sessionService.endSession(req.params.id, req.user.id, req.body);
    res.json({ message: 'Session ended' });
  } catch (err) {
    next(err);
  }
}

async function listSessions(req, res, next) {
  try {
    const page  = parseInt(req.query.page  || '1',  10);
    const limit = parseInt(req.query.limit || '20', 10);
    const result = await sessionService.listSessions(req.user.id, { page, limit });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { createSession, updateSession, endSession, listSessions };
