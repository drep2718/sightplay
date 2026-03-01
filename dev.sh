#!/bin/bash
set -e

# Stop local Homebrew Postgres if running (conflicts with Docker on port 5432)
if brew services list 2>/dev/null | grep -q "postgresql.*started"; then
  echo "Stopping Homebrew Postgres to free port 5432..."
  brew services stop postgresql@14 2>/dev/null || brew services stop postgresql 2>/dev/null || true
fi

# Start infrastructure
echo "Starting Postgres + Redis..."
docker compose up -d

# Install dependencies if needed
if [ ! -d node_modules ]; then
  echo "Installing frontend dependencies..."
  npm install
fi

if [ ! -d server/node_modules ]; then
  echo "Installing backend dependencies..."
  npm install --prefix server
fi

# Free ports if already in use
for PORT in 3001 5173; do
  PID=$(lsof -ti :$PORT) && kill $PID 2>/dev/null && echo "Killed process on port $PORT" || true
done

# Start backend and frontend in parallel
echo "Starting backend (port 3001) and frontend (port 5173)..."
npm run dev --prefix server &
BACKEND_PID=$!

npm run dev &
FRONTEND_PID=$!

# Cleanup on exit
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; docker compose stop" EXIT INT TERM

wait
