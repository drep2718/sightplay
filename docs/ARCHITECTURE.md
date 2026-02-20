# MicroSight — Architecture & Design Reference

Full technical plan covering the database schema, API design, auth flows, security model, and infrastructure.

---

## Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| API server | Node.js + Express | Same language as frontend |
| Database | PostgreSQL | UUID PKs, JSONB, enum types, parameterized queries block SQL injection |
| Cache / Rate-limit store | Redis | Shared state; rate limits, OAuth CSRF state |
| Auth tokens | JWT (15 min access) + rotating refresh token (7 day, HttpOnly cookie) | Short-lived access token limits blast radius; refresh rotation with theft detection |
| Password hashing | bcrypt, 12 rounds | ~250 ms/hash — slows brute-force to ~4 attempts/sec/core |

---

## Database Schema

### `users`
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
email CITEXT UNIQUE NOT NULL
password_hash TEXT
google_id TEXT UNIQUE
display_name TEXT NOT NULL
avatar_url TEXT
role role_enum DEFAULT 'user'           -- 'user' | 'admin'
auth_provider auth_provider_enum        -- 'local' | 'google'
migrated_local_storage BOOL DEFAULT FALSE
is_active BOOL DEFAULT TRUE
created_at, updated_at TIMESTAMPTZ
```

### `refresh_tokens`
```sql
id UUID PRIMARY KEY
user_id UUID FK→users
token_hash TEXT UNIQUE        -- SHA-256 of the raw cookie value (never store raw)
family_id UUID                -- links rotation chain for theft detection
is_valid BOOL DEFAULT TRUE
issued_at, expires_at, last_used_at TIMESTAMPTZ
user_agent TEXT
ip_address INET
```

### `user_preferences`
```sql
user_id PK FK→users
mode TEXT, clef TEXT, tier SMALLINT (1–8), accidentals BOOL
show_keyboard BOOL, kb_size TEXT, bpm SMALLINT (40–180)
time_sig TEXT, interval_max SMALLINT (2–12)
updated_at TIMESTAMPTZ
```

### `all_time_stats`
```sql
user_id PK FK→users
total_attempts INT DEFAULT 0
total_correct INT DEFAULT 0
best_reaction INT (ms, nullable)
reaction_times JSONB            -- last 100 reaction times as array
updated_at TIMESTAMPTZ
```

### `sessions`
```sql
id UUID PRIMARY KEY
user_id FK→users
mode, clef, tier, accidentals, bpm, time_sig, interval_max  -- settings snapshot
started_at, ended_at TIMESTAMPTZ
total_attempts INT, total_correct INT
best_reaction INT, avg_reaction INT
reaction_times JSONB
sheet_filename TEXT, sheet_tempo SMALLINT, sheet_total_cols INT
```

**Key constraints:**
- `CHECK (auth_provider='google' OR password_hash IS NOT NULL)` — local users must have a password
- `CHECK (total_correct <= total_attempts)` — data integrity on both stats tables
- DB trigger prevents demoting the last admin account
- `updated_at` auto-updated via trigger on users, preferences, stats

---

## API Route Map

```
POST   /api/auth/register           register with email+password
POST   /api/auth/login              login, issues JWT pair
POST   /api/auth/refresh            rotate refresh token (reads HttpOnly cookie)
POST   /api/auth/logout             invalidates refresh token
GET    /api/auth/google             redirect to Google OAuth consent page
GET    /api/auth/google/callback    exchange code, issue JWT, redirect to frontend
GET    /api/auth/me                 [auth] current user info

GET    /api/users/preferences       [auth] load preferences
PUT    /api/users/preferences       [auth] save all preferences
DELETE /api/users/account           [auth] delete own account

GET    /api/stats                   [auth] all-time stats
PUT    /api/stats                   [auth] localStorage migration (one-time)
PATCH  /api/stats/attempt           [auth] record one attempt (hot path)

POST   /api/sessions                [auth] create session on Start
PATCH  /api/sessions/:id            [auth] update in progress
POST   /api/sessions/:id/end        [auth] close session on Stop
GET    /api/sessions                [auth] paginated session history

GET    /api/admin/users             [auth+admin] list all users
PATCH  /api/admin/users/:id/role    [auth+admin] change a user's role
DELETE /api/admin/users/:id         [auth+admin] delete a user
GET    /api/admin/stats             [auth+admin] platform aggregate stats
```

---

## Authentication Flows

### Email/Password
1. **Register:** validate → check email not taken → `bcrypt.hash(pw, 12)` → INSERT users + preferences + stats (in transaction) → issue JWT pair → Set-Cookie refresh token
2. **Login:** SELECT by email → `bcrypt.compare` → issue JWT pair → Set-Cookie → respond `{accessToken, user}`
3. Always respond `"Invalid credentials"` for both unknown email AND wrong password (prevents user enumeration)

### Google OAuth
1. `GET /api/auth/google` → generate `state` (32 random bytes), store in Redis 10 min → redirect to Google
2. `GET /api/auth/google/callback` → verify state in Redis (CSRF check) → exchange code → verify ID token → upsert user → issue JWT pair → redirect to frontend

### JWT Design
- **Access token** (15 min, HS256): `{ sub: userId, role, iat, exp, iss: "microsight-api" }` — stored in **JS memory only**
- **Refresh token**: `crypto.randomBytes(32)` raw → HttpOnly cookie; `SHA-256(raw)` stored in DB
- **Rotation + theft detection:** Using a token invalidates it and issues a new one in the same `family_id`. If an already-consumed token is replayed, the **entire family is invalidated** and the user is logged out everywhere.

---

## Security Model

| Threat | Defense |
|--------|---------|
| SQL injection | Parameterized queries (`$1` placeholders) — values never become syntax |
| Password breach | bcrypt(12 rounds) + per-hash salts defeat rainbow tables |
| Brute force login | 10 attempts / IP / 15 min (Redis-backed, shared across instances) |
| XSS stealing tokens | Access token in JS memory; refresh token in HttpOnly cookie |
| CSRF | `SameSite=Strict` cookie; API requires `Authorization: Bearer` header |
| User enumeration | Same error message + bcrypt always runs regardless of whether email exists |
| Clickjacking | `X-Frame-Options: DENY` via Helmet |
| Token theft (refresh) | SHA-256 stored in DB; DB breach doesn't yield usable tokens |
| Last admin removal | DB trigger raises exception |
| MITM | HTTPS at ALB + HSTS (production) |
| Oversized bodies | `express.json({ limit: '10kb' })` |
| Stored XSS | express-validator: email normalize, `.escape()` on display names, length limits |

---

## Folder Structure

```
microsight/
├── src/                        # React frontend (Vite)
│   ├── contexts/AuthContext.jsx
│   ├── hooks/useApi.js
│   ├── hooks/useAuth.js
│   ├── store/index.js          # Zustand store
│   ├── pages/                  # LoginPage, RegisterPage, AuthCallbackPage
│   ├── components/
│   │   ├── auth/               # LoginForm, RegisterForm, GoogleButton
│   │   ├── modes/              # FlashMode, etc.
│   │   └── Sidebar.jsx
│   └── App.jsx
├── server/src/                 # Express API
│   ├── app.js                  # Express factory
│   ├── server.js               # Entry point
│   ├── config/                 # index.js, database.js, redis.js
│   ├── middleware/             # auth.js, requireAdmin.js, rateLimiter.js, validate.js, errorHandler.js
│   ├── routes/                 # auth.js, users.js, stats.js, sessions.js, admin.js
│   ├── controllers/
│   └── services/authService.js
├── migrations/
│   ├── 001_initial_schema.sql
│   └── 002_seed_admin.sql
├── nginx/                      # Production reverse proxy config
├── docs/                       # Architecture docs (you are here)
├── docker-compose.yml          # Dev: postgres + redis only
└── docker-compose.prod.yml     # Prod: postgres + redis + api + nginx
```

---

## localStorage Migration (one-time)

On first login:
1. Frontend reads `localStorage.getItem('microsight-stats')`
2. If data exists AND `user.migratedLocalStorage === false` → `PUT /api/stats { ta, tc, br, rt }`
3. Server merges data (take max attempts/correct, min best_reaction, concat reaction_times)
4. Server sets `migrated_local_storage = TRUE`
5. Frontend removes the localStorage key — never runs again
