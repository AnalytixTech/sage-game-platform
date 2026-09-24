# Host API keys: setup and rotation

The SageGame API only creates game sessions for host apps that send a valid **host key**. This guide covers creating keys, setting them on Render, giving them to a host app such as Japabudz, and replacing (rotating) them.

> **The old key `sec_campus_secret_123` is compromised.** It was in the source code, in the published npm packages and inside the Japabudz mobile app. The API rejects it, so every tenant needs a new key.

## How keys work

| Credential | Who holds it | Where it can live | Lifetime |
|---|---|---|---|
| **Host key** (`sk_live_…`) | The host's **backend server** | Server environment variables only | Until rotated |
| **Session token** (`stk_…`) | The player's app, for one game | The web or mobile app is fine | 1 hour, one session |

The flow:

1. The host app asks **its own backend** to start a game.
2. The host backend calls `POST /v1/sessions` with the host key and gets back a session token.
3. The backend passes only the session token to the app. The app uses it to play that one session.

**Never put a host key in a mobile app, a web frontend, a public repo, or an `EXPO_PUBLIC_*` / `NEXT_PUBLIC_*` variable.** Anything shipped to a device can be pulled out of the app.

## 1. Generate a key for each tenant

Run this once for each tenant and save each output in your password manager:

```bash
node -e "console.log('sk_live_' + require('crypto').randomBytes(24).toString('hex'))"
```

Keys must be at least 24 characters. The API refuses to start with a shorter one.

The API knows these tenants:

| Tenant ID | App | Games it can use |
|---|---|---|
| `tenant_campus_app` | CampusApp / Japabudz | Quiz Master, Word Rush, Memory Match, Word Search, Sudoku |
| `tenant_fitness_app` | FitnessApp | Memory Match, Sudoku |

## 2. Set the keys on the API (Render)

1. Open the Render dashboard, select the **sagegame-api** service, and go to **Environment**.
2. Add this variable. Tenants are separated by commas, and each has the form `tenant_id:key`, with no spaces:

   ```
   SAGE_TENANT_KEYS=tenant_campus_app:sk_live_<campus key>,tenant_fitness_app:sk_live_<fitness key>
   ```

3. Make sure `NODE_ENV=production` is set.
4. Save. Render redeploys automatically.
5. Check the deploy:

   ```bash
   curl https://sage-game-platform.onrender.com/healthz
   # {"ok":true}

   curl -X POST https://sage-game-platform.onrender.com/v1/sessions \
     -H "Authorization: Bearer sk_live_<campus key>" \
     -H "Content-Type: application/json" \
     -d '{"gameId":"game_memory_001","externalUserId":"test_user"}'
   # 201 with sessionId and sessionToken
   ```

If `SAGE_TENANT_KEYS` is missing in production, the API still starts but rejects every session request, and the Render logs say so.

### Local development

If `SAGE_TENANT_KEYS` isn't set and `NODE_ENV` isn't `production`, the API makes a temporary key for `tenant_campus_app` and prints it at startup:

```
[dev] SAGE_TENANT_KEYS not set. Generated a key for tenant_campus_app: sk_dev_…
```

It changes on every restart. To keep a fixed local key, set the variable yourself:

```bash
SAGE_TENANT_KEYS="tenant_campus_app:sk_dev_local_campus_key_0001" npm start -w services/api
```

## 3. Give the key to the host backend

The key goes into the host's **server** environment. For Japabudz, that's `japabudz-server`:

```env
# japabudz-server/.env  (never commit this file)
SAGEGAMES_API_URL=https://sage-game-platform.onrender.com
SAGEGAMES_API_KEY=sk_live_<campus key>
```

japabudz-server then needs an endpoint that the app calls to get a session token. It should:

1. Check that the user is logged in.
2. Call `POST {SAGEGAMES_API_URL}/v1/sessions` with `Authorization: Bearer ${SAGEGAMES_API_KEY}`, using the user's ID as `externalUserId`.
3. Return only `{ sessionId, sessionToken, expiresAt }` to the app.

In **Japabudz-App**, remove `SAGE_GAME_SECRET_KEY` from `lib/api/sage-game.ts`, and have `fetchSageGameSessionToken` call that japabudz-server endpoint instead. Also remove the `sess_fallback_…` fake tokens. If the request fails, show an error instead of a fake game. The full walkthrough will be in `docs/guides/JAPABUDZ_INTEGRATION.md`, written in Phase 3.

The example in [examples/host-backend/server.ts](../examples/host-backend/server.ts) shows the same pattern. It reads `HOST_SECRET_KEY` from the environment and exits if it's missing.

## 4. Rotate a key

Rotate a key immediately if it leaks, and also when someone with access leaves.

1. Generate a new key (step 1).
2. Update the host backend's environment first (for example `SAGEGAMES_API_KEY` in japabudz-server) and deploy it.
3. Replace that tenant's entry in `SAGE_TENANT_KEYS` on Render and save.

The old key stops working the moment Render redeploys. Session tokens that were already issued keep working until they expire (at most 1 hour), so games in progress aren't interrupted.

There's a gap of a minute or two between steps 2 and 3 when session creation fails. To avoid it, do both steps within the same few minutes, at a quiet time. Phase 2 moves keys into the database, so a tenant can have two active keys during a rotation.

## Troubleshooting

| Response | Meaning |
|---|---|
| `401 Missing or invalid Authorization header` | The header is missing, or doesn't start with `Bearer ` |
| `403 Invalid Host Application Secret` | The key doesn't match any tenant: a typo, an old key, or Render hasn't redeployed yet |
| `403 Tenant application is not permitted to access game …` | That tenant can't use this game (see the table in step 1) |
| API crashes at startup with `SAGE_TENANT_KEYS entry … is malformed` | An entry is missing `:`, or a key is shorter than 24 characters |
| `401 Invalid or expired session token` | The session token is older than an hour, or is being used for a different session ID |
