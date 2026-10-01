# Moving from the 2.x deployment (Render + Supabase)

SageGames 2.x ran its API on Render with Supabase for the database (the `sagegames` schema) and for portal accounts (Supabase Auth). Platform 3.0 needs only a SQL database and runs anywhere. This guide moves an existing deployment to 3.0 on Railway (or any host from [Self-hosting](DEPLOYMENT.md)), without changing anything for the apps that use it:

- **API keys keep working**, as long as the new deployment uses the same `API_KEY_PEPPER`.
- **Sessions, results, leaderboards, player stats, quiz banks, matches, webhook settings and history** all move.
- **Portal accounts** move with their email and app memberships. Passwords can't be moved (Supabase keeps them hashed with its own scheme), so each person sets a new one the first time they sign in, from a link that's emailed to them.
- **SDK 2.x apps don't change**: same HTTP API, WebSocket protocol, webhooks and signatures. Only the base URL changes, and you can keep the old URL working until every app has switched.

The old deployment keeps running, untouched, until you switch.

## 1. Set up the new deployment

Follow [Self-hosting → Railway](DEPLOYMENT.md#3-railway-step-by-step) up to the first deploy, with:

- `API_KEY_PEPPER`: **the same value as on Render** (Render → the service → Environment). This is what keeps existing API keys valid.
- a new `AUTH_JWT_SECRET`
- `BREVO_API_KEY` and `EMAIL_FROM` (people need the "set your password" email)
- `PUBLIC_BASE_URL`: the new address, e.g. `https://sagegames.japabudz.com`

Don't create any accounts or apps on the new deployment yet: the import goes into an empty database.

## 2. Export from Supabase

You need the **old database's connection string**: Supabase → the project → **Connect** → **Session pooler** (port 5432). Run the export from a checkout of the repo (or the new service's shell):

```bash
npm ci --include=dev --legacy-peer-deps && npm run build
SOURCE_DATABASE_URL='postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres' \
  node services/api/dist/scripts/export-supabase.js sagegames-export.ndjson
```

The export is read-only and runs in one consistent snapshot:

- every table of the `sagegames` schema
- from Supabase Auth (`auth.users`): the id, email and confirmation date of each person who belongs to an app or created a key

It prints a row count per table. The file holds API key hashes, webhook secrets and player data, so treat it as a secret and delete it after the import.

## 3. Import into the new database

Point `DATABASE_URL` at the new database (Railway: the database's **public** URL, from its **Connect** tab, when running from your machine):

```bash
DATABASE_URL='postgres://postgres:<password>@<host>.proxy.rlwy.net:<port>/railway' \
  node services/api/dist/scripts/import.js sagegames-export.ndjson
```

The import:

- applies the migrations
- refuses to run if the database already has accounts or apps
- loads everything in one transaction (all or nothing)

Any database works as the target: Postgres, MySQL or SQLite.

## 4. Check before switching

1. `curl https://sagegames.japabudz.com/healthz` returns `"migrations":"current"`.
2. Create a session with an **existing** API key against the new URL:

   ```bash
   curl -X POST https://sagegames.japabudz.com/v2/sessions \
     -H "Authorization: Bearer sk_live_…" -H "Content-Type: application/json" \
     -d '{"gameId":"game_memory_001","externalUserId":"migration_check"}'
   ```

   A `201` means the keys (and the pepper) carried over.
3. `GET /v2/leaderboards/<gameId>` with the same key shows the old leaderboard.
4. Sign in at `/portal` with an old account's email. The portal says a link to set a password has been emailed. Set one, and the account's apps, keys, webhook and quiz banks are there.

## 5. Switch

1. Point your apps' backends at the new base URL (`baseUrl` / the URL your server calls for `/v2/sessions`). SDK apps get the URL from your backend or config, so no app store release is needed unless the URL is built into the app.
2. Results submitted to the old deployment after the export don't move automatically. Switch during a quiet time, or export and import again into a fresh database just before switching.
3. When nothing calls the old URL any more, turn off the Render service. The Supabase project can then be paused or deleted (keep a final database backup).

If the new deployment uses a different domain from the old one, webhook receivers don't need changes: deliveries are signed with the same per-app secrets.

## What changed for portal users

- Sign-in, sign-up, password reset and email change happen in the portal itself; emails come from your `EMAIL_FROM` address.
- Sessions are kept by a secure cookie on the portal's domain, so people sign in once per browser on the new domain.
- Everything else (apps, keys, webhooks, quiz banks, the Theme Studio, the docs) works as before.
