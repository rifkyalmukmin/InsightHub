FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
# Build-time secret — `next build` evaluates lib/auth/options.ts (imported by the
# NextAuth route), which calls assertSecureAuthSecret() at module load, so a valid
# NEXTAUTH_SECRET is required to build. Pass it via docker-compose `build.args`.
# It is only used during the build stage; the runtime image reads the secret from
# the container environment (docker-compose `environment`), never from the image.
ARG NEXTAUTH_SECRET
ENV NEXTAUTH_SECRET=$NEXTAUTH_SECRET
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/prisma ./prisma

# Worker runtime — `npm run worker` (tsx scripts/worker.ts) imports from
# lib/ and services/ via the @/* tsconfig path aliases, so the source tree
# and tsconfig.json must be present in the image. Without these the worker
# container crashes on start ("Cannot find module").
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/services ./services
COPY --from=builder /app/tsconfig.json ./tsconfig.json

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["npm", "start"]
