# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS dependencies
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
RUN npm ci

FROM dependencies AS builder
COPY . .
# Next.js imports route modules while collecting build metadata. Use a non-routable
# placeholder so production credentials remain runtime-only and outside image layers.
ENV NEXT_TELEMETRY_DISABLED=1 \
  DATABASE_URL=mysql://build_user:build_password@127.0.0.1:3306/build_only
RUN mkdir -p public && npm run build

FROM dependencies AS migrate
CMD ["npx", "prisma", "migrate", "deploy"]

FROM dependencies AS data-migrate
COPY scripts ./scripts
COPY src/lib/mariaDbConfig.ts ./src/lib/mariaDbConfig.ts
CMD ["npm", "run", "db:migrate-data:mariadb"]

FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

ENV NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1 \
  HOSTNAME=0.0.0.0 \
  PORT=3000

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/check || exit 1

CMD ["node", "server.js"]
