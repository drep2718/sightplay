# MicroSight

A sightreading trainer for musicians. Supports flash cards, sheet music, and interval modes with full account sync across devices.

> Architecture & design reference: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## Prerequisites

Install these before anything else:

| Tool | Download |
|------|----------|
| **Node.js 20+** | https://nodejs.org |
| **Docker Desktop** | https://www.docker.com/products/docker-desktop |

---

## First-Time Setup

### 1. Clone & install dependencies

```bash
git clone <your-repo-url>
cd microsight

# Frontend dependencies (root)
npm install

# Backend dependencies
cd server && npm install && cd ..
```

### 2. Configure environment variables

```bash
cp server/.env.example server/.env
```

Open `server/.env` and fill in the two JWT secrets (generate them with the command below):

```bash
# Run this twice — paste the first output as JWT_ACCESS_SECRET, second as JWT_REFRESH_SECRET
openssl rand -hex 32
```

Your `server/.env` should look like:

```env
NODE_ENV=development
PORT=3001

DB_HOST=localhost
DB_PORT=5432
DB_NAME=microsight
DB_USER=postgres
DB_PASSWORD=postgres

REDIS_HOST=localhost
REDIS_PORT=6379

JWT_ACCESS_SECRET=<paste 64-char hex string here>
JWT_REFRESH_SECRET=<paste different 64-char hex string here>

# Optional — only needed if you want Google Sign-In (see below)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:3001/api/auth/google/callback

FRONTEND_URL=http://localhost:5173
```

### 3. Start the database and Redis

```bash
# From the project root — starts Postgres + Redis in the background
docker compose up -d
```

Verify they're running:

```bash
docker compose ps
# Both services should show "healthy"
```

> The database schema is applied automatically on first start (from `migrations/`).
> Postgres data persists in a Docker volume — it survives container restarts.

### 4. Run the app (two terminals)

**Terminal 1 — API server:**
```bash
cd server
npm run dev
```

You should see:
```
✓ PostgreSQL connected
✓ Redis connected
✓ MicroSight API listening on port 3001 [development]
```

**Terminal 2 — Frontend (from project root):**
```bash
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## Google Sign-In Setup (optional)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. **APIs & Services → OAuth consent screen** → External → fill in app name + your email
3. **APIs & Services → Credentials → + Create Credentials → OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Authorized redirect URI: `http://localhost:3001/api/auth/google/callback`
4. Copy the Client ID and Client Secret into `server/.env`:
   ```env
   GOOGLE_CLIENT_ID=<your client id>
   GOOGLE_CLIENT_SECRET=<your client secret>
   ```
5. Restart the API server

---

## Make Your Account Admin

After registering via the app, run this once to promote your account:

```bash
docker exec -it microsight-postgres-1 psql -U postgres -d microsight \
  -c "UPDATE users SET role='admin' WHERE email='your@email.com';"
```

---

## Stopping Everything

```bash
# Stop the frontend and API servers: Ctrl+C in each terminal

# Stop Postgres and Redis (keeps data)
docker compose down

# Stop and DELETE all data (fresh start)
docker compose down -v
```

---

## Common Issues

**"Required environment variable JWT_ACCESS_SECRET is not set"**
→ Make sure `server/.env` exists and has real values (not the example placeholders).

**"connect ECONNREFUSED 127.0.0.1:5432"**
→ Docker isn't running, or containers aren't started. Run `docker compose up -d`.

**Port 5432 already in use**
→ You have a local Postgres installation running. Either stop it (`brew services stop postgresql`) or change `DB_PORT` in `.env` and the port mapping in `docker-compose.yml`.

**Google OAuth "Missing required parameter: client_id"**
→ `GOOGLE_CLIENT_ID` is blank in `server/.env`. Follow the Google Sign-In setup steps above.

---

## Production Build (Docker, all-in-one)

Builds and runs everything — frontend + backend + nginx — in containers:

```bash
# Copy and configure the root-level .env for production
cp server/.env.example .env
# Edit .env with production secrets

docker compose -f docker-compose.prod.yml up -d --build
```

The app will be available on port 80 (nginx reverse proxy).
