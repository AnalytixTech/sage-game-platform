# API keys: getting, using and rotating them

Host apps (for example Japabudz) get their own API keys from the **developer portal**, so nobody has to generate keys by hand. This guide covers the portal flow, how keys must be stored, rotation, and the temporary bootstrap keys for tenants that existed before the portal.

> **The old key `sec_campus_secret_123` is compromised.** It was in the source code, in the published npm packages and inside the Japabudz mobile app. The API rejects it.

## How the credentials fit together

| Credential | Looks like | Who holds it | Lifetime |
| --- | --- | --- | --- |
| **API key** | `sk_live_…` / `sk_test_…` | The host's **backend server**, in an environment variable | Until revoked |
| **Session token** | `stk_…` | The player's app, for one game | 1 hour, one session |
| **Webhook secret** | `whsec_…` | The host's backend, to verify webhook signatures | Until rotated |

The flow:

1. The app asks **its own backend** to start a game.
2. The backend calls `POST /v2/sessions` with its API key and gets back a session token.
3. The backend passes only that session token to the app.

**Never put an API key in a mobile app, a web frontend, a public repo, or an `EXPO_PUBLIC_*` / `NEXT_PUBLIC_*` variable.** Anything shipped to a device can be pulled out of the app.

## 1. Get a key from the portal

1. Open `https://<api-host>/portal/` and **create an account**. Confirm your email from the link you receive, then sign in.
2. Click **New app**, name it (e.g. *Japabudz*) and tick the games it will use.
3. On the **API keys** tab, create a key:
   - **Live** keys create real sessions. Their verified scores count on leaderboards and trigger webhooks.
   - **Test** keys work the same way, but their results never reach leaderboards or webhooks. Use them for development and CI.
4. **Copy the key when it's shown.** This is the only time you'll see it; the platform stores only a hash. If you lose it, create a new key and revoke the old one.

An app can have up to 10 active keys, so each environment (production, staging, CI) can have its own.

## 2. Store it on the backend

```env
# japabudz-server/.env  (never commit this file)
SAGEGAMES_API_URL=https://sage-game-platform.onrender.com
SAGEGAMES_API_KEY=sk_live_…
```

Set the same variables in your host's dashboard (Render, Railway, etc.) for production. The portal's **Quickstart** tab shows the session-creation call ready to copy.

## 3. Rotate a key

Rotate a key immediately if it leaks, or when someone with access leaves:

1. Create a new key in the portal.
2. Update the backend's environment variable and deploy.
3. Once the new key is working (the old key's **Last used** stops changing), click **Revoke** on the old key.

Revoking takes effect immediately. Session tokens that were already issued keep working until they expire (at most 1 hour), so games in progress aren't cut off. Because the old and new keys can both be active at once, a rotation needs no downtime.

## 4. Webhooks (optional)

On the app's **Webhook** tab, set an HTTPS endpoint. The platform then POSTs a `session.completed` event with the verified score whenever a game finishes.

Each request carries a `Sage-Signature: t=<unix>,v1=<hex>` header. `v1` is the HMAC-SHA256 of `"<t>.<raw body>"`, keyed with the webhook secret shown on that tab. Verify the signature before trusting the payload. The Japabudz integration guide includes a ready-made verifier.

## Bootstrap keys (tenants from before the portal)

A tenant that existed before the portal (such as `tenant_campus_app`) can keep working through a bootstrap key while it moves to portal keys:

1. On Render, set `SAGE_TENANT_KEYS=tenant_campus_app:<long random secret>`. Generate the secret with:

   ```bash
   node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
   ```

   It must be at least 24 characters. When the API starts, it creates the tenant if it's missing.
2. Have the tenant's owner sign up in the portal, then attach the tenant to their account:

   ```bash
   DATABASE_URL=… node services/api/dist/scripts/claim-tenant.js tenant_campus_app owner@example.com
   ```

3. The owner creates a portal key, switches their backend to it, and you remove the entry from `SAGE_TENANT_KEYS`.

Bootstrap keys can't be revoked from the portal. Retire them as soon as the tenant is on portal keys.

## Troubleshooting

| Response | Meaning |
| --- | --- |
| `401 Missing or invalid Authorization header` | The header is missing, or doesn't start with "Bearer" |
| `403 invalid_api_key` | Mistyped, revoked, or from a different environment |
| `403 game_not_enabled` | The app hasn't enabled that game. Change it on the portal's **Games** tab |
| `400 invalid_config` | The game `config` sent with the session is invalid; the message says which field |
| `401 invalid_session_token` / `session_expired` | The session token is for a different session, or is older than an hour |
| `426 sdk_update_required` | The app's SDK is older than the game rules on the server. Update `@sagegames/*` |
