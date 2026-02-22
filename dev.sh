#!/bin/bash
set -e

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

# Start backend and frontend in parallel
echo "Starting backend (port 3001) and frontend (port 5173)..."
npm run dev --prefix server &
BACKEND_PID=$!

npm run dev &
FRONTEND_PID=$!

# Cleanup on exit
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; docker compose stop" EXIT INT TERM

wait
