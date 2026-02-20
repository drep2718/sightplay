FROM node:20-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

# Install dependencies separately so this layer caches
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

EXPOSE 3001

# Run as non-root
RUN addgroup -S microsight && adduser -S microsight -G microsight
USER microsight

CMD ["node", "src/server.js"]
