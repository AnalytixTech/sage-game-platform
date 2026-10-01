# SageGames platform: API, developer portal, battle WebSockets and webhook delivery in one image.
# Works on any host that runs containers (Railway, Render, Fly, a VPS…) with any supported
# database (DATABASE_URL: postgres://, mysql:// or sqlite:/app/data/sagegames.db on a volume).
#
#   docker build -t sagegames .
#   docker run -p 4000:4000 -v sagegames-data:/app/data \
#     -e DATABASE_URL=sqlite:/app/data/sagegames.db -e API_KEY_PEPPER=… -e AUTH_JWT_SECRET=… \
#     -e PUBLIC_BASE_URL=https://games.example.com sagegames

# ---- Build: compile the packages, the API and the portal
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
COPY games ./games
COPY services ./services
COPY examples ./examples
COPY docs ./docs
COPY CHANGELOG.md README.md tsconfig.json ./
RUN npm ci --include=dev --legacy-peer-deps --no-audit --no-fund
RUN npm run build
# Keep only what runs in production.
RUN npm prune --omit=dev --legacy-peer-deps --no-audit --no-fund

# ---- Run
FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=4000
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/games ./games
COPY --from=build /app/services/api/package.json ./services/api/package.json
COPY --from=build /app/services/api/dist ./services/api/dist
COPY --from=build /app/services/portal/package.json ./services/portal/package.json
COPY --from=build /app/services/portal/dist ./services/portal/dist
# SQLite databases live here (mount a volume); the app runs as the unprivileged `node` user.
RUN mkdir -p /app/data && chown node:node /app/data
VOLUME ["/app/data"]
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# --migrate applies pending migrations first (under a lock, so it's safe on every start).
CMD ["node", "services/api/dist/server.js", "--migrate"]
