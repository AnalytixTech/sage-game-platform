# syntax=docker/dockerfile:1.7
#
# SageGames platform: one Node process serving the game API (/v1, /v2), battle WebSockets
# (/v2/ws), webhook delivery and the developer portal (/portal). See docs/DOCKER.md.
#
#   docker build -t sagegames .
#   docker compose up -d                  (production: compose.yml)
#
# The database is chosen at runtime by DATABASE_URL (postgres://, mysql:// or sqlite:/app/data/…).
# No secrets are baked in: everything is read from the environment when the container starts.

ARG NODE_VERSION=22.20.0

# ---- Build: install everything, compile the packages, the API and the portal, then reinstall
# only what the API needs at runtime.
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /src
ENV CI=true NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false NPM_CONFIG_AUDIT=false

# Workspaces and the lockfile first, so dependency installs are cached until they change.
COPY package.json package-lock.json tsconfig.json ./
COPY packages ./packages
COPY games ./games
COPY services ./services
COPY examples ./examples
# The portal bundles the docs and changelog at build time.
COPY docs ./docs
COPY CHANGELOG.md README.md ./
COPY deploy/assemble-runtime.sh ./deploy/

RUN --mount=type=cache,target=/root/.npm \
    npm ci --include=dev --legacy-peer-deps
RUN npm run build

# Production dependencies of the API only (no React, TypeScript or test tools in the image).
RUN --mount=type=cache,target=/root/.npm \
    rm -rf ./node_modules ./*/*/node_modules \
 && npm ci --omit=dev --ignore-scripts --legacy-peer-deps \
      --workspace @sagegames/api-service --include-workspace-root=false
RUN sh deploy/assemble-runtime.sh /out

# ---- Runtime
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
LABEL org.opencontainers.image.title="sagegames" \
      org.opencontainers.image.description="SageGames platform: game API, battle WebSockets, webhooks and developer portal" \
      org.opencontainers.image.source="https://github.com/AnalytixTech/sage-game-platform" \
      org.opencontainers.image.licenses="UNLICENSED"

ENV NODE_ENV=production \
    PORT=4000 \
    NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app
COPY --from=build --chown=root:root /out /app

# SQLite data (when DATABASE_URL=sqlite:/app/data/…) is the only thing the app writes; mount a
# volume here. The code itself stays root-owned and read-only to the app user.
RUN mkdir -p /app/data && chown node:node /app/data
VOLUME ["/app/data"]

USER node
EXPOSE 4000

# The app's own health endpoint: the database answers and every migration is applied.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

# SIGTERM: stop accepting connections, close battles, flush, exit (within 10 s).
STOPSIGNAL SIGTERM
# Migrations are a separate, explicit step (docs/DOCKER.md); the server refuses to start while any
# are pending. Append --migrate to apply them on start instead (simple single-container hosts).
CMD ["node", "services/api/dist/server.js"]
