# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV HUSKY=0
ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable

WORKDIR /app

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/teaching-studio ./apps/teaching-studio

RUN pnpm install --frozen-lockfile

FROM deps AS builder

RUN pnpm turbo build --filter=@assistant-ui/teaching-studio...

FROM node:24-bookworm-slim AS runner

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

WORKDIR /app

RUN groupadd --system --gid 1001 nodejs
RUN useradd --system --uid 1001 --gid 1001 nextjs

COPY --from=builder /app/apps/teaching-studio/.next/standalone ./
COPY --from=builder /app/apps/teaching-studio/.next/static ./apps/teaching-studio/.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "apps/teaching-studio/server.js"]
