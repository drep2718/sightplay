'use strict';

const userService = require('../services/userService');
const authService = require('../services/authService');

async function getPreferences(req, res, next) {
  try {
    const prefs = await userService.getPreferences(req.user.id);
    if (!prefs) return res.status(404).json({ error: 'Preferences not found' });
    res.json({ preferences: prefs });
  } catch (err) {
    next(err);
  }
}

async function updatePreferences(req, res, next) {
  try {
    await userService.updatePreferences(req.user.id, req.body);
    res.json({ message: 'Preferences saved' });
  } catch (err) {
    next(err);
  }
}

async function deleteAccount(req, res, next) {
  try {
    const raw = req.cookies?.refreshToken;
    await authService.logout(raw);
    authService.clearRefreshCookie(res);
    await userService.deleteAccount(req.user.id);
    res.json({ message: 'Account deleted' });
  } catch (err) {
    next(err);
  }
}

module.exports = { getPreferences, updatePreferences, deleteAccount };
