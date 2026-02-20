'use strict';

const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { OAuth2Client } = require('google-auth-library');
const { query, withTransaction } = require('../config/database');
const { getRedis } = require('../config/redis');
const { getConfig } = require('../config/index');

const BCRYPT_ROUNDS = 12;
const ACCESS_TOKEN_TTL  = '15m';
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ─────────────────────────────────────────────────────────────
// Token helpers
// ─────────────────────────────────────────────────────────────

function issueAccessToken(userId, role) {
  const { jwt: jwtConfig } = getConfig();
  return jwt.sign(
    { sub: userId, role, iss: 'microsight-api' },
    jwtConfig.accessSecret,
    { expiresIn: ACCESS_TOKEN_TTL }
  );
}

/**
 * Creates a new refresh token, stores its SHA-256 hash in the DB,
 * and returns the raw token (stored in cookie).
 */
async function issueRefreshToken(userId, familyId, userAgent, ipAddress) {
  const raw = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  await query(
    `INSERT INTO refresh_tokens
       (user_id, token_hash, family_id, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, hash, familyId, expiresAt, userAgent || null, ipAddress || null]
  );

  return { raw, expiresAt };
}

function setRefreshCookie(res, rawToken, expiresAt) {
  res.cookie('refreshToken', rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    expires: expiresAt,
    path: '/api/auth',
  });
}

function clearRefreshCookie(res) {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/auth',
  });
}

/** Create linked rows for a brand-new user (preferences + stats) */
async function createUserRelatedRows(client, userId) {
  await client.query(
    'INSERT INTO user_preferences (user_id) VALUES ($1)',
    [userId]
  );
  await client.query(
    'INSERT INTO all_time_stats (user_id) VALUES ($1)',
    [userId]
  );
}

// ─────────────────────────────────────────────────────────────
// Registration
// ─────────────────────────────────────────────────────────────

async function register({ email, password, displayName }, userAgent, ipAddress) {
  const { rows: existing } = await query(
    'SELECT id FROM users WHERE email = $1',
    [email]
  );
  if (existing.length) {
    const err = new Error('Email already registered');
    err.statusCode = 409;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // Transaction: insert user + linked rows only.
  // Token issuance happens after commit so the FK constraint is satisfied.
  const user = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO users (email, password_hash, display_name, auth_provider)
       VALUES ($1, $2, $3, 'local')
       RETURNING id, email, display_name, avatar_url, role, migrated_local_storage`,
      [email, passwordHash, displayName || email.split('@')[0]]
    );
    await createUserRelatedRows(client, rows[0].id);
    return rows[0];
  });

  const familyId = uuidv4();
  const accessToken = issueAccessToken(user.id, user.role);
  const { raw: refreshRaw, expiresAt } = await issueRefreshToken(
    user.id, familyId, userAgent, ipAddress
  );

  return { user, accessToken, refreshRaw, expiresAt };
}

// ─────────────────────────────────────────────────────────────
// Login
// ─────────────────────────────────────────────────────────────

async function login({ email, password }, userAgent, ipAddress) {
  const { rows } = await query(
    `SELECT id, email, password_hash, display_name, avatar_url, role,
            migrated_local_storage, is_active, auth_provider
     FROM users WHERE email = $1`,
    [email]
  );

  // Always run bcrypt to prevent timing-based user enumeration
  const dummyHash = '$2b$12$invalidhashpaddingtomatchlength000000000000000000000000000';
  const candidate = rows[0];
  const hashToCompare = candidate?.password_hash || dummyHash;

  const match = await bcrypt.compare(password, hashToCompare);

  if (!candidate || !match || !candidate.is_active || candidate.auth_provider !== 'local') {
    const err = new Error('Invalid credentials');
    err.statusCode = 401;
    throw err;
  }

  const familyId = uuidv4();
  const accessToken = issueAccessToken(candidate.id, candidate.role);
  const { raw: refreshRaw, expiresAt } = await issueRefreshToken(
    candidate.id, familyId, userAgent, ipAddress
  );

  const { password_hash: _, ...user } = candidate;
  return { user, accessToken, refreshRaw, expiresAt };
}

// ─────────────────────────────────────────────────────────────
// Refresh token rotation
// ─────────────────────────────────────────────────────────────

async function refreshTokens(rawToken, userAgent, ipAddress) {
  if (!rawToken) {
    const err = new Error('Refresh token required');
    err.statusCode = 401;
    throw err;
  }

  const hash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const { rows } = await query(
    `SELECT rt.id, rt.user_id, rt.family_id, rt.is_valid, rt.expires_at,
            u.role, u.is_active
     FROM refresh_tokens rt
     JOIN users u ON u.id = rt.user_id
     WHERE rt.token_hash = $1`,
    [hash]
  );

  if (!rows.length) {
    const err = new Error('Invalid refresh token');
    err.statusCode = 401;
    throw err;
  }

  const token = rows[0];

  if (!token.is_valid) {
    // Token reuse detected — invalidate entire family (theft detection)
    await query(
      'UPDATE refresh_tokens SET is_valid = FALSE WHERE family_id = $1',
      [token.family_id]
    );
    const err = new Error('Refresh token reuse detected');
    err.statusCode = 401;
    throw err;
  }

  if (new Date(token.expires_at) < new Date() || !token.is_active) {
    await query(
      'UPDATE refresh_tokens SET is_valid = FALSE WHERE id = $1',
      [token.id]
    );
    const err = new Error('Refresh token expired');
    err.statusCode = 401;
    throw err;
  }

  // Invalidate the used token and issue a new one in the same family
  await query(
    'UPDATE refresh_tokens SET is_valid = FALSE, last_used_at = NOW() WHERE id = $1',
    [token.id]
  );

  const { rows: userRows } = await query(
    'SELECT id, email, display_name, avatar_url, role, migrated_local_storage FROM users WHERE id = $1',
    [token.user_id]
  );
  const user = userRows[0];

  const accessToken = issueAccessToken(user.id, user.role);
  const { raw: refreshRaw, expiresAt } = await issueRefreshToken(
    user.id, token.family_id, userAgent, ipAddress
  );

  return { user, accessToken, refreshRaw, expiresAt };
}

// ─────────────────────────────────────────────────────────────
// Logout
// ─────────────────────────────────────────────────────────────

async function logout(rawToken) {
  if (!rawToken) return;
  const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
  await query(
    'UPDATE refresh_tokens SET is_valid = FALSE WHERE token_hash = $1',
    [hash]
  );
}

// ─────────────────────────────────────────────────────────────
// Google OAuth
// ─────────────────────────────────────────────────────────────

async function getGoogleAuthUrl() {
  const { google } = getConfig();
  const state = crypto.randomBytes(32).toString('hex');

  // Store state in Redis for 10 minutes (CSRF prevention)
  await getRedis().setex(`oauth:state:${state}`, 600, '1');

  const client = new OAuth2Client(google.clientId, google.clientSecret, google.callbackUrl);
  const url = client.generateAuthUrl({
    access_type: 'offline',
    scope: ['openid', 'email', 'profile'],
    state,
    prompt: 'select_account',
  });

  return url;
}

async function handleGoogleCallback({ code, state }, userAgent, ipAddress) {
  const { google } = getConfig();

  // Verify CSRF state
  const stateKey = `oauth:state:${state}`;
  const valid = await getRedis().get(stateKey);
  if (!valid) {
    const err = new Error('Invalid OAuth state');
    err.statusCode = 400;
    throw err;
  }
  await getRedis().del(stateKey);

  // Exchange code for tokens
  const oauthClient = new OAuth2Client(google.clientId, google.clientSecret, google.callbackUrl);
  const { tokens } = await oauthClient.getToken(code);
  oauthClient.setCredentials(tokens);

  // Verify ID token
  const ticket = await oauthClient.verifyIdToken({
    idToken: tokens.id_token,
    audience: google.clientId,
  });
  const payload = ticket.getPayload();

  const { sub: googleId, email, name: displayName, picture: avatarUrl } = payload;

  // Upsert: link if email already exists, otherwise create
  const result = await withTransaction(async (client) => {
    let { rows } = await client.query(
      'SELECT id, role, migrated_local_storage FROM users WHERE google_id = $1 OR email = $2',
      [googleId, email]
    );

    let user;
    if (rows.length) {
      // Existing user — link Google account if not already
      await client.query(
        `UPDATE users
         SET google_id = $1, avatar_url = $2,
             auth_provider = CASE WHEN auth_provider = 'local' THEN 'local' ELSE 'google' END
         WHERE id = $3`,
        [googleId, avatarUrl, rows[0].id]
      );
      user = rows[0];
    } else {
      const { rows: newRows } = await client.query(
        `INSERT INTO users (email, google_id, display_name, avatar_url, auth_provider)
         VALUES ($1, $2, $3, $4, 'google')
         RETURNING id, role, migrated_local_storage`,
        [email, googleId, displayName, avatarUrl]
      );
      user = newRows[0];
      await createUserRelatedRows(client, user.id);
    }

    return user;
  });

  const familyId = uuidv4();
  const accessToken = issueAccessToken(result.id, result.role);
  const { raw: refreshRaw, expiresAt } = await issueRefreshToken(
    result.id, familyId, userAgent, ipAddress
  );

  return { userId: result.id, accessToken, refreshRaw, expiresAt };
}

module.exports = {
  register,
  login,
  refreshTokens,
  logout,
  getGoogleAuthUrl,
  handleGoogleCallback,
  setRefreshCookie,
  clearRefreshCookie,
};
