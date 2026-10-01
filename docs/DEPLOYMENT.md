# Self-hosting the SageGames platform

The platform is one Node service: the game API (`/v1`, `/v2`), the battle WebSocket (`/v2/ws`), webhook delivery and the developer portal (`/portal`, with its own accounts). It needs a SQL database and, for account emails, a Brevo API key. Nothing else.

It runs anywhere a container or Node 22 runs. This guide covers:

1. [Choosing a database](#1-choose-a-database)
2. [Configuration](#2-configuration)
3. [Railway, step by step](#3-railway-step-by-step)
4. [Any host with Docker](#4-any-host-with-docker) (a VPS shared with other products: [Docker deployment](DOCKER.md))
5. [Email](#5-email)
6. [The first account](#6-the-first-account)
7. [Backups](#7-backups)
8. [One instance per deployment](#8-one-instance-per-deployment)
9. [Upgrades and migrations](#9-upgrades-and-migrations)

Moving an existing 2.x deployment? Follow [Moving from the 2.x deployment](MOVING_TO_3.md).

## 1. Choose a database

`DATABASE_URL` picks the database by its scheme:

| Database | `DATABASE_URL` | Good for |
| --- | --- | --- |
| **Postgres** 13+ | `postgres://user:password@host:5432/sagegames` | Most deployments: Railway Postgres, Neon, RDS, Cloud SQL, any managed or self-hosted Postgres |
| **MySQL** 8 / **MariaDB** 10.6+ | `mysql://user:password@host:3306/sagegames` | Teams already running MySQL (PlanetScale-style hosts, RDS MySQL, self-hosted) |
| **SQLite** | `sqlite:/app/data/sagegames.db` | One server and modest traffic: a single file, nothing else to run. Put it on a persistent volume. |

All tables are named `sagegames_*`, so the platform can share a database with other apps. Connection poolers are fine, including transaction poolers (PgBouncer, Neon's pooled endpoint): nothing depends on per-connection settings.

Everything is tested on every database. The full API suite runs on SQLite, Postgres, MySQL 8 and MariaDB in CI.

## 2. Configuration

| Variable | Required | Value |
| --- | --- | --- |
| `DATABASE_URL` | yes | See above. |
| `API_KEY_PEPPER` | in production | 32+ random characters. Mixed into API key hashes: **changing it invalidates every API key**, so store it safely. |
| `AUTH_JWT_SECRET` | in production | 32+ random characters. Signs portal sessions; changing it signs everyone out of the portal. |
| `PUBLIC_BASE_URL` | yes | Where the service is reachable, e.g. `https://sagegames.sageanalytix.cloud`. Email links point here. |
| `BREVO_API_KEY`, `EMAIL_FROM` | for sign-up | Account emails (see [Email](#5-email)). Without them, development logs the links instead. |
| `NODE_ENV` | | `production` on servers. |
| `PORT` | | Default `4000`; most hosts set it. |
| `DATABASE_SSL` | | `auto` (default: TLS for public database hosts, not for `localhost` or private network names such as `postgres.railway.internal`), `true` or `false`. |
| `DATABASE_POOL_SIZE` | | Connections to keep open (Postgres/MySQL). Default `10`; lower it on small plans. |
| `SAGE_TENANT_KEYS` | | Bootstrap keys for apps that existed before the portal (see [KEYS_SETUP.md](KEYS_SETUP.md)). |
| `SENTRY_DSN` | | Report unexpected errors to Sentry. Without it, errors are only logged. |
| `RELEASE` | | The deployed version in logs and Sentry. Defaults to `RAILWAY_GIT_COMMIT_SHA` or `RENDER_GIT_COMMIT`. |
| `LOG_LEVEL`, `LOG_FORMAT` | | `info` and `json` in production by default. |

Generate the secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

[`services/api/.env.example`](../services/api/.env.example) lists them all for local runs.

## 3. Railway, step by step

The repo includes a [`Dockerfile`](../Dockerfile) and a [`railway.json`](../railway.json): Railway builds the image, runs the migrations before each deploy, health-checks `/healthz` and restarts the service if it crashes.

1. **Create a project** at railway.com → **New project → Deploy from GitHub repo** → pick the repository. Railway finds `railway.json` and builds with the Dockerfile.
2. **Add a database.** In the project, **New → Database → PostgreSQL** (or MySQL). Railway creates it next to the service.
3. **Set the variables** on the service (**Variables** tab):
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (a reference to the database's private URL; for MySQL, `${{MySQL.MYSQL_URL}}`)
   - `NODE_ENV` = `production`
   - `API_KEY_PEPPER`, `AUTH_JWT_SECRET`: two different random values
   - `PUBLIC_BASE_URL` = your domain, e.g. `https://sagegames.sageanalytix.cloud`
   - `BREVO_API_KEY`, `EMAIL_FROM` (see [Email](#5-email))
4. **Deploy.** Each deploy runs `node services/api/dist/scripts/migrate.js` first (the pre-deploy command), then starts the server. The deploy logs show `Applied 0001_init (postgres).` the first time, then `listening` with `database: "postgres"`.
5. **Add the domain.** **Settings → Networking → Custom Domain** → `sagegames.sageanalytix.cloud`. Railway shows a CNAME record. Add it at your DNS provider (for `sagegames.sageanalytix.cloud`: a `CNAME` named `sagegames` pointing to the target Railway gives you). Railway issues the TLS certificate once DNS resolves.
6. **Check it:**

   ```bash
   curl https://sagegames.sageanalytix.cloud/healthz    # {"ok":true,"database":"postgres","migrations":"current"}
   curl https://sagegames.sageanalytix.cloud/v2/games   # the five games
   ```

   Then open `https://sagegames.sageanalytix.cloud/portal/`, sign up and confirm the email (or [create the first account](#6-the-first-account) without email).

**SQLite on Railway:** add a volume to the service mounted at `/app/data` and set `DATABASE_URL=sqlite:/app/data/sagegames.db`. Volumes aren't attached during the pre-deploy step, so remove the pre-deploy command and set the start command to `node services/api/dist/server.js --migrate` instead.

**Keep one replica.** `railway.json` sets `numReplicas: 1`. Don't scale the service horizontally (see [One instance per deployment](#8-one-instance-per-deployment)). Give it more CPU and memory instead.

**Proxies and WebSockets.** Battles use a WebSocket on `/v2/ws` through Railway's proxy, with nothing to configure. The server pings every connection every 25 seconds, well inside the proxy's idle timeout, so quiet lobbies stay open. It also keeps HTTP keep-alive connections open for 65 seconds, longer than the proxy does.

## 4. Any host with Docker

On a VPS that hosts other products too, use the Compose setup in [Docker deployment](DOCKER.md): a shared reverse-proxy network, no published ports, resource limits, a hardened container, and backup and rollback steps. For a single container:

```bash
docker build -t sagegames .

# SQLite on a volume: the simplest install
docker run -d --name sagegames -p 4000:4000 -v sagegames-data:/app/data \
  -e NODE_ENV=production \
  -e DATABASE_URL=sqlite:/app/data/sagegames.db \
  -e API_KEY_PEPPER=<random> -e AUTH_JWT_SECRET=<random> \
  -e PUBLIC_BASE_URL=https://games.example.com \
  -e BREVO_API_KEY=xkeysib-… -e EMAIL_FROM="SageGames <no-reply@example.com>" \
  sagegames node services/api/dist/server.js --migrate
```

The image:

- runs as an unprivileged user
- doesn't migrate on its own: add `--migrate` to the command (as above) to apply pending migrations on start, under a lock, or run `node services/api/dist/scripts/migrate.js` in a one-off container first
- health-checks `/healthz`
- keeps SQLite data in `/app/data`

For Postgres or MySQL, pass that `DATABASE_URL` instead and drop the volume.

Put a TLS-terminating proxy in front (Caddy, nginx, a load balancer, or your host's), forwarding WebSocket upgrades on `/v2/ws`. The service trusts one proxy hop for `X-Forwarded-For` and `X-Forwarded-Proto`. Proxy idle timeouts of 60 seconds or more are fine.

Without Docker: Node 22.13+ (SQLite support is built into Node from there), then

```bash
npm ci --include=dev --legacy-peer-deps && npm run build
node services/api/dist/server.js --migrate
```

Render works the same way: a Docker web service from the repo, with the health check path `/healthz` and one instance.

## 5. Email

The portal sends account emails itself: sign-up confirmation, password reset, email change and "password changed" notices. They go through **Brevo's transactional API**.

1. **Authenticate your sending domain** in Brevo: **Senders, Domains & Dedicated IPs → Domains → Add a domain**. Add the records Brevo lists at your DNS provider:
   - the `brevo-code` TXT record
   - the DKIM records
   - a DMARC record if you have none: `v=DMARC1; p=none` is a safe start

   Wait until Brevo shows the domain as **Authenticated**, or mail lands in spam.
2. **Add the sender** (e.g. `no-reply@sageanalytix.cloud`) under **Senders**.
3. **Create an API key** under **SMTP & API → API keys** (it starts with `xkeysib-`).
4. Set `BREVO_API_KEY` and `EMAIL_FROM="SageGames <no-reply@sageanalytix.cloud>"` on the service.
5. Sign up at `/portal` with a real inbox. Delivery status is under **Brevo → Transactional → Logs**.

Without a key, development and test runs log each email's links instead of sending them. Production answers "We couldn't send the email" until a key is set.

## 6. The first account

Anyone can sign up at `/portal`. To create the first owner without email (a fresh install, or before Brevo is set up), run this where the service runs (Railway: the service's shell, or `railway run`):

```bash
node services/api/dist/scripts/create-user.js owner@example.com 'A-strong-passw0rd'
```

To give an account an app created from `SAGE_TENANT_KEYS`:

```bash
node services/api/dist/scripts/claim-tenant.js tenant_campus_app owner@example.com
```

## 7. Backups

| Database | Back up with |
| --- | --- |
| Postgres | Your host's automated backups (Railway, Neon and RDS all have them), plus `pg_dump --format=custom "$DATABASE_URL" > sagegames.dump` for an off-site copy. Restore with `pg_restore --clean --dbname "$DATABASE_URL" sagegames.dump`. |
| MySQL / MariaDB | Host backups, plus `mysqldump --single-transaction --routines sagegames > sagegames.sql`. Restore with `mysql sagegames < sagegames.sql`. |
| SQLite | `sqlite3 /app/data/sagegames.db ".backup '/app/data/backup.db'"` while the service runs (a consistent copy), then copy `backup.db` off the volume. Or snapshot the volume. Restore by replacing the file while the service is stopped. |

Keep `API_KEY_PEPPER` with the backups. A restored database needs the same pepper for its API keys to work.

## 8. One instance per deployment

Battle rooms (lobby, countdown, live race) live in the memory of the process that runs them, so a deployment must run **exactly one** API process. Two processes would split the players of one match between them.

- Railway: `numReplicas: 1` (in `railway.json`). Render: one instance. Kubernetes: `replicas: 1` with a `Recreate` rollout.
- Each process records a heartbeat in the database. If it sees another live one, it logs `another API instance is using this database`. That's expected for a few seconds during a rolling deploy; a lasting warning means a second replica is running.
- On restart, races that were running are marked `aborted` (their live state was in memory). Lobbies are picked up again from the database.

Scale up rather than out: one Node process handles thousands of concurrent players. Broadcasts go through a `MatchBus` interface (in memory today), so a Redis-backed bus can spread battles across instances later without changing game code.

## 9. Upgrades and migrations

Schema changes ship as migrations inside the API (`services/api/src/db/migrations/`). Each runs once per database and is recorded in `sagegames_migrations`. A lock (an advisory lock on Postgres, `GET_LOCK` on MySQL, the single writer on SQLite) means two deploys never migrate at once.

- **Railway:** applied by the pre-deploy command on every deploy.
- **Docker Compose:** `docker compose run --rm sagegames-migrate` before `docker compose up -d` ([Docker deployment](DOCKER.md#database-migrations)).
- **Single container:** start it with `--migrate`.
- **By hand:** `npm run db:migrate`, or `node services/api/dist/scripts/migrate.js`.

Without `--migrate`, the server refuses to start while migrations are pending and says how to apply them. `/healthz` answers `503` with `"migrations": "pending"` in that state.

## Running locally

```bash
cp services/api/.env.example services/api/.env    # SQLite by default: nothing else to install
npm run build
node --env-file=services/api/.env services/api/dist/server.js --migrate
# The portal with hot reload (proxies API calls to :4000):
npm run dev -w services/portal                    # http://localhost:5173/portal/
```

Without `BREVO_API_KEY`, the server logs the links from sign-up and reset emails. Open them to confirm an account.

## Tests

`npm test` runs offline. The API suite runs twice: on SQLite and on PGlite (Postgres compiled to WebAssembly). Point it at real servers to run them too:

```bash
TEST_MYSQL_URL=mysql://root:pw@127.0.0.1:3306/mysql \
TEST_POSTGRES_URL=postgres://postgres:pw@127.0.0.1:5432/postgres npm test
```

Each test gets a fresh database on that server. `npm run test:flow -- sqlite:./.e2e/sagegames.db` drives the whole flow (sign-up to verified game) against the production server in a real browser.

## Publishing the SDK packages

Push a version tag (for example `git tag v2.3.0 && git push --tags`). The **Publish NPM Packages** workflow then builds, tests and publishes every public package whose version isn't on npm yet. The API, portal and examples are private and never published.
