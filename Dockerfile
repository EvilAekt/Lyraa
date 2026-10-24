# syntax=docker/dockerfile:1
# Multi-stage Dockerfile for Bot-AI (VTuber AI Discord Bot)
# Conforms strictly to SEC-11 (non-root, minimal attack surface, health port only) and TDD §13.

# -------------------------------------------------------------
# Stage 1: Build & Compile TypeScript
# -------------------------------------------------------------
FROM node:20.18.0-alpine3.20 AS builder

# Install build dependencies for native Node addons (gyp, C++ compilation)
RUN apk add --no-cache python3 make g++ git

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy TypeScript configuration and source code
COPY tsconfig.json ./
COPY src/ ./src/
COPY persona/ ./persona/

# Compile TypeScript to dist/
RUN npm run build

# -------------------------------------------------------------
# Stage 2: Production Minimal Runtime
# -------------------------------------------------------------
FROM node:20.18.0-alpine3.20 AS runner

LABEL org.opencontainers.image.title="Bot-AI"
LABEL org.opencontainers.image.description="Autonomous VTuber AI Discord Voice Bot with DAVE E2EE protocol"
LABEL org.opencontainers.image.version="0.1.0"

# Install production native runtime packages:
# - ffmpeg: Required for audio decoding/encoding in voice pipeline
# - wget: Lightweight probe for container HEALTHCHECK
# - dumb-init: Lightweight init system for proper signal forwarding (SIGINT/SIGTERM)
RUN apk add --no-cache ffmpeg wget dumb-init

ENV NODE_ENV=production
ENV HEALTH_PORT=8080
ENV BOT_ENABLED=true

WORKDIR /app

# Create working directories and assign ownership to non-root user 'node' (SEC-11)
RUN mkdir -p /app/data /app/logs /app/debug_audio \
    && chown -R node:node /app

# Copy package manifests and install only production dependencies
COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled JavaScript from builder stage
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/persona ./persona

# Enforce non-root execution (SEC-11)
USER node

# Expose ONLY the health check port (SEC-11, SEC-12)
EXPOSE 8080

# Configure Docker healthcheck against local endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

# Signal handling via dumb-init for graceful shutdown
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/index.js"]
