# Docker deployment (shared VPS)

How to run SageGames as one independent product on a VPS that also hosts other, unrelated products, behind a shared Caddy or nginx. For managed hosts (Railway) and the general configuration reference, see [Self-hosting](DEPLOYMENT.md).

## Architecture

```text
Internet ──443──▶ shared reverse proxy (Caddy/nginx, owns ports 80/443)
                        │  docker network "proxy" (shared by every product)
                        ▼
              sagegames-app:4000  ───────────────┐  network "sagegames-internal" (this product only)
              (API, portal, WebSockets,          ▼
               webhook worker)            sagegames-db:5432 (optional Postgres)
                   │
                   ├── volume sagegames-data   (SQLite file, when used)
                   └── outbound HTTPS: Brevo (emails), customers' webhook URLs, Sentry (optional)
```

**One container does everything, on purpose.** The platform is a single Node process serving the game API (`/v1`, `/v2`), the battle WebSocket (`/v2/ws`), the developer portal (`/portal`, static files) and the webhook delivery worker:

- **Battle rooms live in that process's memory.** Splitting the WebSocket server or running replicas would split players of the same match. So: one container, one replica.
- **The webhook worker is a 5-second poll inside the same process.** It claims deliveries with database locks, so it's safe, and it needs nothing separate.
- **There are no cron jobs, queues or other workers.**
- **The portal is static files served by the same process.** It needs no web server of its own.

| | |
| --- | --- |
| Language / runtime | TypeScript compiled to JavaScript; Node.js 22 (22.13+; the image pins 22.20) |
| Build | npm workspaces (`package-lock.json`), `tsc --build`, Vite for the portal |
| Start | `node services/api/dist/server.js` |
| Port | 4000 (internal only) |
| Database | Postgres, MySQL 8 / MariaDB 10.6+ or SQLite, chosen by `DATABASE_URL` |
| Health | `GET /healthz` (database reachable and migrations current) |

## Requirements

- Docker Engine 24+ with Compose v2.20+ (`docker compose version`)
- A shared reverse proxy on the external Docker network `proxy` (or a host-level proxy, see [Reverse proxy](#reverse-proxy))
- About 600 MB of disk for the image, plus the database
- DNS for the product's domain pointing at the VPS
- For portal emails: a Brevo account with an authenticated sending domain ([Email](DEPLOYMENT.md#5-email))

## Environment variables

All configuration lives in `.env` next to `compose.yml` (copy [`.env.example`](../.env.example)). Compose reads it, and only the app's own settings are passed into the container.

| Variable | When | Required | Notes |
| --- | --- | --- | --- |
| `SAGEGAMES_IMAGE` | build | no | Image name:tag to build and run (default `sagegames:latest`) |
| `NODE_VERSION` | build | no | Dockerfile build argument (default `22.20.0`) |
| `COMPOSE_PROJECT_NAME` | compose | no | Unique prefix for this product's containers, network and volumes (default `sagegames`) |
| `PROXY_NETWORK` | compose | no | Shared proxy network name (default `proxy`) |
| `COMPOSE_PROFILES` | compose | no | `postgres` to run the bundled database |
| `SAGEGAMES_CPUS`, `SAGEGAMES_MEMORY`, `SAGEGAMES_HEAP_MB` | compose | no | [Resource limits](#resource-management) |
| `DATABASE_URL` | runtime | **yes** | `sqlite:/app/data/sagegames.db`, `postgres://…@sagegames-db:5432/sagegames`, or an external Postgres/MySQL URL |
| `API_KEY_PEPPER` | runtime | **yes** | 32+ chars. Changing it invalidates every API key: back it up with the database |
| `AUTH_JWT_SECRET` | runtime | **yes** | 32+ chars. Signs portal sessions |
| `PUBLIC_BASE_URL` | runtime | **yes** | The public `https://` address. Email links point here, and the portal's cookie is `Secure` |
| `BREVO_API_KEY`, `EMAIL_FROM` | runtime | for sign-up | Without them, sign-up and password-reset emails fail in production |
| `DATABASE_SSL`, `DATABASE_POOL_SIZE`, `SAGE_TENANT_KEYS`, `SENTRY_DSN`, `LOG_LEVEL`, `LOG_FORMAT`, `RELEASE` | runtime | no | See [Self-hosting → Configuration](DEPLOYMENT.md#2-configuration) |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | runtime (db) | with the `postgres` profile | The bundled database's credentials |

Nothing is needed at build time: the image contains no secrets, URLs or keys. If a required variable is missing, `docker compose` stops before starting anything and names it.

## Building

```bash
cd /opt/apps/sagegames
docker compose build                       # tags ${SAGEGAMES_IMAGE}
```

The Dockerfile is multi-stage:

1. **Build stage:** installs every workspace and compiles the packages, the API and the portal. It then reinstalls only the API's production dependencies.
2. **Runtime stage:** contains the compiled API, the built portal and about 120 MB of production `node_modules`. There are no compilers, dev dependencies, sources of the SDK UI packages or secrets.

## Running

### First deployment

```bash
# Once per VPS (shared by every product; skip if it exists):
docker network create proxy

sudo mkdir -p /opt/apps && cd /opt/apps
git clone https://github.com/AnalytixTech/sage-game-platform.git sagegames && cd sagegames
cp .env.example .env && chmod 600 .env
# Edit .env: DATABASE_URL, API_KEY_PEPPER, AUTH_JWT_SECRET (openssl rand -hex 32), PUBLIC_BASE_URL, BREVO_API_KEY, EMAIL_FROM.
# With the bundled Postgres: COMPOSE_PROFILES=postgres, POSTGRES_PASSWORD, and
#   DATABASE_URL=postgres://sagegames:<POSTGRES_PASSWORD>@sagegames-db:5432/sagegames

docker compose build
docker compose run --rm sagegames-migrate      # creates the tables
docker compose up -d --wait                     # starts, and waits until healthy
docker compose ps

# First portal owner, without email (optional):
docker compose exec sagegames-app node services/api/dist/scripts/create-user.js owner@example.com 'A-strong-passw0rd'
```

Then add the site to the reverse proxy ([below](#reverse-proxy)) and open `https://<domain>/portal/`.

### Day to day

| Task | Command |
| --- | --- |
| Status and health | `docker compose ps` |
| Logs (follow) | `docker compose logs -f sagegames-app` |
| Restart | `docker compose restart sagegames-app` |
| Stop / start | `docker compose stop` / `docker compose up -d` |
| Shell (read-only filesystem) | `docker compose exec sagegames-app sh` |
| Remove containers (keeps volumes) | `docker compose down` |

Only this product's containers are affected: everything is scoped by `COMPOSE_PROJECT_NAME`.

## Updating

```bash
cd /opt/apps/sagegames
git pull
export SAGEGAMES_IMAGE=sagegames:$(git rev-parse --short HEAD)   # or set it in .env
docker compose build
docker compose run --rm sagegames-migrate
docker compose up -d --wait
docker image prune -f --filter "label=org.opencontainers.image.title=sagegames"   # untagged leftovers of this product only
# Keep the previous tag for rollback; remove older ones by name:
docker images sagegames --format '{{.Tag}} {{.CreatedSince}}'   # then: docker rmi sagegames:<old-sha>
```

Tagging each build with its commit is what makes [rollback](#rollback) a one-line change. The container is recreated in a few seconds:

- the proxy holds requests during the gap (see the Caddy example)
- battles in progress are ended (rooms live in memory); lobbies survive
- players' apps reconnect by themselves

Deploy at a quiet time.

With images from the registry instead of building on the server (the Docker workflow pushes `ghcr.io/analytixtech/sage-game-platform:<short-sha>` on every push to `main`):

```bash
SAGEGAMES_IMAGE=ghcr.io/analytixtech/sage-game-platform:<sha> docker compose pull sagegames-app
SAGEGAMES_IMAGE=… docker compose run --rm sagegames-migrate && SAGEGAMES_IMAGE=… docker compose up -d --wait
```

## Database migrations

Migrations are TypeScript, built into the image (`services/api/src/db/migrations`), one set for every database. Each is applied once and recorded in `sagegames_migrations`, under a lock (an advisory lock on Postgres, `GET_LOCK` on MySQL, the single writer on SQLite).

- **Apply:** `docker compose run --rm sagegames-migrate` before `up` on every deploy. It's safe to repeat: it does nothing when the database is current.
- **Safety:** migrations only add (tables, columns, indexes). None drop data, and released migrations are never edited.
- The app **does not** migrate on start (in `compose.yml`). It refuses to start while migrations are pending, and `/healthz` answers 503 `"migrations":"pending"`, so a forgotten step is loud, not silent.
- Single-container hosts without Compose can append `--migrate` to the command instead.
- Back up before deploying a release whose changelog mentions a migration.

## Logs

- The app logs one JSON object per line to stdout (`LOG_FORMAT=json`), with request id, method, path (no query string), status, duration and app.
- Credentials (API keys, session tokens, webhook secrets, bearer tokens, passwords, connection-string passwords) are redacted before writing.
- Docker's `json-file` driver rotates them: 10 MB × 5 files for the app, 10 MB × 3 for the database. That's at most 80 MB on disk for this product.
- Nothing is written to files inside the container: the root filesystem is read-only.
- `LOG_LEVEL=debug` for troubleshooting; `info` in production.
- `docker compose logs -f --since 10m sagegames-app | jq .` to read them; ship them with any Docker log collector.

## Health checks

- **Container:** the image's `HEALTHCHECK` (and `compose.yml`) calls `GET /healthz` every 30 s from inside the container. It's healthy when the database answers and all migrations are applied (`{"ok":true,"database":"postgres","migrations":"current"}`).
- **Restarts:** `restart: unless-stopped` restarts the app if it exits. Docker marks it unhealthy after three failures, but doesn't restart a running-but-unhealthy container by itself; alert on `docker compose ps` / `docker inspect --format '{{.State.Health.Status}}'` in your monitoring.
- **External monitoring:** check `https://<domain>/healthz` through the proxy (any status other than 200 means trouble).
- **Bundled Postgres:** `pg_isready` every 10 s. The migrate service waits for it to be healthy.

## Reverse proxy

**Public ports:** only the shared proxy's 80 and 443. The app's port 4000 and the database's 5432 are **never published on the host**: the proxy reaches the app over the `proxy` network as `sagegames-app:4000`, and only the app reaches the database, over this product's internal network.

What the proxy must handle:

- **WebSockets** on `/v2/ws` (battles). Connections stay open for minutes; the app pings every 25 s, so a proxy idle timeout of 60 s or more is enough.
- **`X-Forwarded-For` / `X-Forwarded-Proto`.** The app trusts **one** proxy hop for client IPs (rate limits, logs). With a CDN such as Cloudflare in front of the proxy, client IPs in logs are the CDN's; rate limits still work per CDN edge.
- **HTTPS.** Required: the portal's session cookie is `Secure`.
- **Bodies.** Small JSON (at most 256 KB). No uploads, no SSE, no long requests besides the WebSocket.

**Caddy** in Docker on the `proxy` network: add the block from [`deploy/Caddyfile.example`](../deploy/Caddyfile.example):

```caddyfile
sagegames.japabudz.com {
	encode zstd gzip
	reverse_proxy sagegames-app:4000 {
		lb_try_duration 15s
		lb_try_interval 250ms
		stream_close_delay 5m
	}
}
```

Caddy issues the certificate and passes WebSocket upgrades through. `lb_try_duration` holds requests while the app restarts during a deploy (tested: a request during a restart waited 3 s and succeeded instead of failing).

**nginx:** see [`deploy/nginx.conf.example`](../deploy/nginx.conf.example). It has the WebSocket `Upgrade`/`Connection` headers on `/v2/ws` with 300 s timeouts, the forwarded headers, and a 1 MB body limit.

**Proxy on the host instead of in Docker:** uncomment the `ports:` line in `compose.yml` to publish on `127.0.0.1:${SAGEGAMES_HOST_PORT:-14000}` only, with a port no other product uses, and point the proxy there.

## Backups

| Data | Where | How |
| --- | --- | --- |
| Bundled Postgres | volume `<project>_sagegames-pgdata` | `docker compose exec -T sagegames-db pg_dump -U sagegames -Fc sagegames > sagegames-$(date +%F).dump`. Restore: `docker compose exec -T sagegames-db pg_restore -U sagegames -d sagegames --clean < file.dump` |
| SQLite | volume `<project>_sagegames-data` | `docker compose exec sagegames-app node -e "new (require('node:sqlite').DatabaseSync)('/app/data/sagegames.db').exec(\"VACUUM INTO '/app/data/backup.db'\")"` then `docker compose cp sagegames-app:/app/data/backup.db ./sagegames-$(date +%F).db` |
| External Postgres/MySQL | the provider | The provider's backups, plus `pg_dump` / `mysqldump` |
| Secrets | `.env` | Keep a copy (password manager / secrets store). **`API_KEY_PEPPER` must match the database**, or every API key stops working |

Schedule the dump with the host's cron or backup tool, copy it off the VPS, and test a restore now and then. Nothing else needs backing up: the image is rebuilt from Git, and logs are disposable.

**Temporary data:** `/tmp` (tmpfs, 16 MB), battle rooms in memory and container logs.

**Persistent data:** the database (a volume or external server) and `.env`.

## Rollback

```bash
cd /opt/apps/sagegames
SAGEGAMES_IMAGE=sagegames:<previous-sha> docker compose up -d --wait     # or set it in .env
```

The previous image is still on the server if you tag builds by commit (see [Updating](#updating)). Otherwise: `git checkout <previous-commit> && docker compose build && docker compose up -d --wait`.

Migrations are additive, so an older version keeps working with a newer schema; there's no "down" step. If a release ever needs a data-changing migration, its changelog will say so; restore the pre-deploy backup to undo it.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `required variable … is missing a value` | Set it in `.env` (see [Environment variables](#environment-variables)). |
| `network proxy declared as external, but could not be found` | `docker network create proxy` (once per VPS), or set `PROXY_NETWORK` to your proxy's network. |
| Container restarts; logs say `Database migrations are pending` | `docker compose run --rm sagegames-migrate`. |
| Unhealthy, logs show connection errors | Check `DATABASE_URL`. With the bundled Postgres, the host is `sagegames-db` and `COMPOSE_PROFILES=postgres` must be set. For external databases, check TLS (`DATABASE_SSL=true`) and firewall rules from the VPS. |
| 502 from the proxy | The proxy isn't on the `proxy` network, or uses another name: `docker network inspect proxy` should list both. The upstream is `sagegames-app:4000`. |
| Battles stuck on "Connecting…" | The proxy isn't passing WebSocket upgrades on `/v2/ws` (nginx: the `Upgrade`/`Connection` headers). |
| Signed out of the portal on every reload | `PUBLIC_BASE_URL` must be `https://…` and the site served over HTTPS (the cookie is `Secure`). |
| `SQLITE_READONLY` / permission errors | The `sagegames-data` volume must be writable by uid 1000. Created by Compose it is; if you replaced it with a bind mount, `chown 1000:1000` the directory. |
| Out of memory / restarts under load | Raise `SAGEGAMES_MEMORY` and `SAGEGAMES_HEAP_MB` together (heap ≈ 75 % of the limit). |
| Disk filling up | `docker image prune -f --filter "label=org.opencontainers.image.title=sagegames"` removes this product's untagged leftovers; `docker rmi sagegames:<old-sha>` removes old tagged builds (keep the previous one for rollback). Logs are already capped. |

## Resource management

The platform is one Node process: mostly I/O, with short CPU bursts for score replays and password hashing (scrypt, about 32 MB for a few tens of milliseconds per sign-in).

| Service | CPU limit | CPU reserved | Memory limit | Memory reserved | PIDs | Why |
| --- | --- | --- | --- | --- | --- | --- |
| `sagegames-app` | 1.0 | 0.25 | 512 MB | 192 MB | 256 | Node uses one core for JavaScript. Steady state is about 100–150 MB; 512 MB leaves room for a busy battle server and concurrent sign-ins. The V8 heap is capped at 384 MB (`NODE_OPTIONS`) so Node collects garbage before the container limit kills it. |
| `sagegames-db` (optional) | 1.0 | 0.1 | 512 MB | 128 MB | 256 | Small working set; Postgres defaults fit. Raise with traffic. |
| `sagegames-migrate` | 1.0 | – | 384 MB | – | – | Runs for seconds, then exits. |

Adjust them in `.env` (`SAGEGAMES_CPUS`, `SAGEGAMES_MEMORY`, `SAGEGAMES_HEAP_MB`, `SAGEGAMES_DB_*`). A runaway process is stopped at its memory limit and restarted, and is throttled at its CPU limit. The PID limit stops fork bombs. Other products are not affected.

**Scale up, not out:** one replica only (battle rooms are in memory). More CPU and memory serve more players.

## Security

- **App container:**
  - runs as uid 1000 (`node`), never root
  - read-only root filesystem, with writable `/tmp` (tmpfs) and `/app/data` (volume) only
  - all Linux capabilities dropped; `no-new-privileges`
  - no host mounts, no Docker socket, no host networking, not privileged
  - the code in the image is root-owned and read-only to the app
- **Database container:** reachable only on the product's internal network, never published. It has only the capabilities its entrypoint needs to drop to the `postgres` user (`CHOWN`, `DAC_OVERRIDE`, `FOWNER`, `SETGID`, `SETUID`).
- **Secrets:**
  - live only in `.env` (`chmod 600`, gitignored, excluded from the build context by `.dockerignore`) and the container's environment
  - the image contains none
  - Compose passes the app only its own variables
  - logs redact credentials
- **Image:**
  - official `node:22-bookworm-slim` (Debian 12), with no extra packages
  - production dependencies of the API only
  - pinned Node version and lockfile-exact installs (`npm ci`)
  - rebuild regularly to pick up base image security fixes (`docker compose build --pull`)
- **Isolation from other products:**
  - own project name, internal network and volumes
  - shares only the `proxy` network, with a unique alias (`sagegames-app`)
  - no fixed host ports, no global system changes
- **Application:**
  - API keys and tokens are stored hashed
  - the portal uses `httpOnly` / `Secure` / `SameSite` cookies and checks a CSRF header
  - rate limits apply on sign-in and key routes
  - Helmet security headers, with CORS open only on the bearer-token game API
