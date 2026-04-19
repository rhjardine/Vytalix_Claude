# =============================================================================
# Vytalix Clinical Intelligence Engine — Dockerfile
# Multi-stage: development (hot reload) → builder → production (minimal image)
# =============================================================================

# ── Base: Node 20 Alpine ──
FROM node:20-alpine AS base
RUN apk add --no-cache openssl postgresql-client
WORKDIR /app
ENV PNPM_HOME="/pnpm" PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# ── Dependencies ──
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ── Development: source mounted, hot reload ──
FROM base AS development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm prisma generate
EXPOSE 3001
CMD ["pnpm", "dev"]

# ── Builder: compile TypeScript ──
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm prisma generate
RUN pnpm build

# ── Production: minimal image ──
FROM node:20-alpine AS production
RUN apk add --no-cache openssl postgresql-client wget
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma
COPY migration_rls.sql ./

# Non-root user for production security
RUN addgroup -g 1001 -S vytalix && adduser -S vytalix -u 1001
USER vytalix

EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/server.js"]
