# ── Stage 1: Build the Vite frontend ────────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /build

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.js ./
COPY src ./src
COPY public ./public 2>/dev/null || true

RUN npm run build
# Output: /build/dist

# ── Stage 2: Production server ───────────────────────────────────────────────
FROM node:20-alpine AS server
WORKDIR /app
ENV NODE_ENV=production

# Server dependencies
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev && npm cache clean --force

# Server source
COPY server/src ./server/src

# Built frontend (served as static files by Express in production)
COPY --from=frontend-builder /build/dist ./dist

# DB migrations (run by startup script or manually)
COPY migrations ./migrations

EXPOSE 3001

# Run as non-root for security
RUN addgroup -S microsight && adduser -S microsight -G microsight
USER microsight

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

CMD ["node", "server/src/server.js"]
