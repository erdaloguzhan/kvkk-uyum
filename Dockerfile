# Tüm sistemi (API + web) tek depodan derleyen Docker imajları.
# Kullanım: docker compose up --build  (bkz. docs/YEREL-KURULUM.md)
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY packages packages
COPY apps apps
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @kvkk/shared build \
  && pnpm --filter @kvkk/api build \
  && pnpm --filter @kvkk/web build

# API: açılışta veritabanı migration'larını çalıştırır, sonra sunucuyu başlatır.
FROM base AS api
ENV NODE_ENV=production
COPY --from=build /app /app
COPY content /app/content
WORKDIR /app/apps/api
USER node
EXPOSE 3000
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/main.js"]

# Web: Next.js'in bağımsız (standalone) çıktısı.
FROM node:22-alpine AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
