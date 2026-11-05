# syntax=docker/dockerfile:1
# Keep the base image patch in sync with .nvmrc.
FROM node:26.13.0-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs \
    && mkdir -p /data/objects /data/mail \
    && chown -R nextjs:nodejs /data
ENV npm_config_engine_strict=true
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder
COPY . .
# Prisma generation needs a syntactically valid URL, never a real database.
RUN DATABASE_URL=postgresql://build_only:build_only@localhost:5432/build_only npx prisma generate
# The application validation bypass is scoped to compilation, never runtime.
RUN SKIP_ENV_VALIDATION=true NODE_ENV=production npm run build

FROM base AS worker-deps
COPY package.json package-lock.json ./
RUN PRISMA_SKIP_POSTINSTALL_GENERATE=true npm ci --omit=dev

FROM base AS worker
ENV NODE_ENV=production
ENV WORKER_HEALTH_FILE=/tmp/brokermogger-worker-id
ENV STORAGE_LOCAL_DIR=/data/objects
ENV MOCK_EMAIL_DIR=/data/mail
COPY --from=worker-deps /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY package.json package-lock.json tsconfig.json ./
COPY lib ./lib
COPY workers ./workers
COPY prisma ./prisma
COPY scripts ./scripts
USER nextjs
HEALTHCHECK --interval=15s --timeout=10s --start-period=30s --retries=3 CMD ["node", "--import", "tsx", "workers/health.ts"]
CMD ["node", "--import", "tsx", "workers/worker.ts"]

FROM base AS migrate
COPY docker/migrate/package.json docker/migrate/package-lock.json ./
RUN npm ci --omit=dev
COPY prisma.config.ts ./
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY prisma/migrations ./prisma/migrations
ENV NODE_ENV=production
USER nextjs
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]

# The default target is the web app. Next's trace supplies runtime dependencies.
FROM base AS app
ENV NODE_ENV=production
ENV STORAGE_LOCAL_DIR=/data/objects
ENV MOCK_EMAIL_DIR=/data/mail
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
