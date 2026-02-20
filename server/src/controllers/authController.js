'use strict';

const authService = require('../services/authService');
const userService = require('../services/userService');
const { getConfig } = require('../config/index');

function clientIp(req) {
  return req.ip || req.connection?.remoteAddress;
}

async function register(req, res, next) {
  try {
    const { email, password, displayName } = req.body;
    const { user, accessToken, refreshRaw, expiresAt } = await authService.register(
      { email, password, displayName },
      req.headers['user-agent'],
      clientIp(req)
    );
    authService.setRefreshCookie(res, refreshRaw, expiresAt);
    res.status(201).json({ accessToken, user });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const { user, accessToken, refreshRaw, expiresAt } = await authService.login(
      { email, password },
      req.headers['user-agent'],
      clientIp(req)
    );
    authService.setRefreshCookie(res, refreshRaw, expiresAt);
    res.json({ accessToken, user });
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const raw = req.cookies?.refreshToken;
    const { user, accessToken, refreshRaw, expiresAt } = await authService.refreshTokens(
      raw,
      req.headers['user-agent'],
      clientIp(req)
    );
    authService.setRefreshCookie(res, refreshRaw, expiresAt);
    res.json({ accessToken, user });
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    const raw = req.cookies?.refreshToken;
    await authService.logout(raw);
    authService.clearRefreshCookie(res);
    res.json({ message: 'Logged out' });
  } catch (err) {
    next(err);
  }
}

async function googleRedirect(req, res, next) {
  try {
    const url = await authService.getGoogleAuthUrl();
    res.redirect(url);
  } catch (err) {
    next(err);
  }
}

async function googleCallback(req, res, next) {
  try {
    const { code, state } = req.query;
    const { userId, accessToken, refreshRaw, expiresAt } = await authService.handleGoogleCallback(
      { code, state },
      req.headers['user-agent'],
      clientIp(req)
    );

    authService.setRefreshCookie(res, refreshRaw, expiresAt);

    const { frontendUrl } = getConfig();
    // Pass access token in fragment — never logged by servers
    res.redirect(`${frontendUrl}/auth/callback#token=${accessToken}`);
  } catch (err) {
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const user = await userService.getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, refresh, logout, googleRedirect, googleCallback, me };
