# Deploying the SageGames platform

The platform has two parts:

| Part | Runs on | What it does |
| --- | --- | --- |
| **Database + portal accounts** | Supabase (Postgres + Auth) | Stores tenants, keys, sessions, results and leaderboards in the `sagegames` schema. Supabase Auth handles developer sign-up, email confirmation and password resets. |
| **API + developer portal** | Render (Node web service) | Serves the game API (`/v1`, `/v2`), replays and verifies scores, sends webhooks, and serves the portal at `/portal`. |

Everything about the database is configured from this repo with the Supabase CLI (`npx supabase …`). The CLI is a dev dependency, so no global install is needed.

---

## 1. Connect the repo to the Supabase project (once per machine)

```bash
npx supabase login                               # opens a browser to authorise the CLI
npx supabase link --project-ref <project-ref>    # asks for the database password
```

The project ref is the id in the dashboard URL: `https://supabase.com/dashboard/project/<project-ref>`.

## 2. Apply the database schema

```bash
npm run db:push          # = npx supabase db push
```

This applies every file in [`supabase/migrations/`](../supabase/migrations) that the project hasn't run yet. All tables are created in a dedicated `sagegames` schema:

- It won't clash with tables other apps keep in `public` in the same project.
- Supabase's Data API doesn't expose it, and Row Level Security is enabled with no policies, so the anon key cannot read anything. Only the platform API, connecting as the database owner, uses these tables.

To change the schema later, add a migration and push it:

```bash
npm run db:new -- add_something     # creates supabase/migrations/<timestamp>_add_something.sql
# edit the file, run the tests (they apply every migration), then:
npm run db:push
```

Never edit a migration that has already been pushed.

## 3. Configure Supabase Auth for the portal

The portal's auth settings live in [`supabase/config.toml`](../supabase/config.toml) under `[auth]`:

- email confirmation required before sign-in
- passwords of at least 10 characters, with upper and lower case letters and a digit
- redirect URLs for the portal (`site_url` and `additional_redirect_urls`)

Push them with:

```bash
npx supabase config push
```

> **If the Supabase project is shared with another app**, `config push` overwrites that app's auth settings too (site URL, redirect URLs, sign-up rules). In that case, don't push. Instead, set these by hand in the dashboard under **Authentication → URL Configuration / Providers → Email**:
>
> - add `https://<your-render-url>/portal/` to the redirect URLs
> - turn on **Confirm email**

### Email delivery (Brevo API, from sageanalytix.cloud)

Portal emails are sent by the **`send-email` Edge Function** ([supabase/functions/send-email](../supabase/functions/send-email)) through **Brevo's transactional email API**, as `SageGames <no-reply@sageanalytix.cloud>`. That covers sign-up confirmation, password reset, email change, the reauthentication code, and notices such as "password changed". SMTP isn't used.

How it works:

1. Supabase Auth calls the function for every auth email, signing the request with a shared secret (`[auth.hook.send_email]` in `config.toml`).
2. The function verifies the signature, renders the SageGames template ([templates.ts](../supabase/functions/send-email/templates.ts)) and posts it to `https://api.brevo.com/v3/smtp/email`.

The function runs on Supabase, so sign-up emails don't depend on the Render API being awake.

One-time setup:

1. **Authenticate the domain in Brevo.** Go to **Senders, Domains & Dedicated IPs → Domains → Add a domain → `sageanalytix.cloud`**. Brevo lists DNS records to add at your DNS provider:
   - a `brevo-code` TXT record (ownership)
   - DKIM records (`brevo1._domainkey`, `brevo2._domainkey`)
   - a DMARC TXT record on `_dmarc` if you don't have one; `v=DMARC1; p=none; rua=mailto:postmaster@sageanalytix.cloud` is a safe start

   Wait until Brevo shows the domain as **Authenticated**. Without this, mail lands in spam or is rejected.
2. **Add the sender** `no-reply@sageanalytix.cloud` under **Senders**.
3. **Create an API key** under **SMTP & API → API keys** (it starts with `xkeysib-`). Put it in `supabase/.env`. Git ignores that file, and it already holds a generated `SEND_EMAIL_HOOK_SECRET`:

   ```env
   SEND_EMAIL_HOOK_SECRET=v1,whsec_…   # generated; the function and the Auth hook must share it
   BREVO_API_KEY=xkeysib-…
   ```

4. **Deploy, in this order,** so the function exists before Auth starts calling it:

   ```bash
   npx supabase secrets set --env-file supabase/.env
   npx supabase functions deploy send-email --use-api --no-verify-jwt
   set -a; . supabase/.env; set +a      # makes SEND_EMAIL_HOOK_SECRET available to config push
   npx supabase config diff              # should show only the send_email hook and email settings
   npx supabase config push
   ```

5. **Test it:** sign up at `/portal` with a real inbox. The email should arrive from `no-reply@sageanalytix.cloud`.
   - If it doesn't arrive, check **Supabase → Edge Functions → send-email → Logs**.
   - For delivery status, check **Brevo → Transactional → Logs**.

**Changing an email:** edit `templates.ts`, run `npm test`, then run `npx supabase functions deploy send-email --use-api --no-verify-jwt`.

**Rotating the Brevo key:** update `BREVO_API_KEY` in `supabase/.env` and run `npx supabase secrets set --env-file supabase/.env`. No redeploy is needed.

**Rotating the hook secret:** put a new `v1,whsec_<base64>` value in the file, then run both `secrets set` and `config push`.

Brevo's free plan sends 300 emails a day, far more than the portal needs. Supabase's own rate limit is 60 auth emails an hour (`[auth.rate_limit] email_sent`).

## 4. Deploy the API on Render

Create a **Web Service** from the GitHub repo:

- **Build command:** `npm install --include=dev --legacy-peer-deps && npm run build`
- **Start command:** `node services/api/dist/server.js`
- **Health check path:** `/healthz`

Environment variables (see [`services/api/.env.example`](../services/api/.env.example)):

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Supabase → **Connect** → **Session pooler** connection string (port **5432**). Don't use the transaction pooler on port 6543: the API sets the schema per connection. |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | The project's publishable (anon) key. It is safe to expose; the portal uses it in the browser. |
| `API_KEY_PEPPER` | 32+ random characters (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). **Changing it invalidates every API key**, so store it somewhere safe. |
| `PUBLIC_BASE_URL` | The Render URL, e.g. `https://sage-game-platform.onrender.com` |
| `SAGE_TENANT_KEYS` | Optional. Bootstrap keys for tenants that existed before the portal (see [KEYS_SETUP.md](KEYS_SETUP.md)). |

When the API starts, it:

1. checks that the schema exists (and exits with "run `npx supabase db push`" if it doesn't)
2. syncs the game catalog into the database
3. creates any tenants named in `SAGE_TENANT_KEYS`
4. starts the webhook worker

The free Render plan sleeps after 15 minutes idle, and the first request afterwards takes 30–60 seconds. That's fine for trying the platform out. Use a paid plan once real players depend on it, and certainly for online battles.

## 5. Check the deployment

```bash
curl https://<render-url>/healthz            # {"ok":true}: API and database reachable
curl https://<render-url>/v2/games           # the five games
open https://<render-url>/portal/            # sign up, confirm the email, create an app and a key
```

Then create a session with the new key:

```bash
curl -X POST https://<render-url>/v2/sessions \
  -H "Authorization: Bearer sk_live_…" -H "Content-Type: application/json" \
  -d '{"gameId":"game_memory_001","externalUserId":"test_user"}'
```

## Running locally

```bash
cp services/api/.env.example services/api/.env    # fill in the values
npm run build
node --env-file=services/api/.env services/api/dist/server.js
# Portal with hot reload (proxies API calls to :4000):
npm run dev -w services/portal                    # http://localhost:5173/portal/
```

## Tests

`npm test` runs every test offline. The API tests run against **PGlite**, a real Postgres compiled to WebAssembly, with the same migrations from `supabase/migrations`. So SQL and schema problems show up in tests and in CI without a database server.

## Publishing the SDK packages

Push a version tag (for example `git tag v2.0.0 && git push --tags`). The **Publish NPM Packages** workflow then builds, tests and publishes every public package whose version isn't on npm yet. The services and examples are private and never published.
