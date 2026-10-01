# SageGames architecture

SageGames lets host apps (for example Japabudz) embed casual games with scores the server can verify. Host apps own their users; the platform owns game rules, sessions, verification, leaderboards and webhooks.

## Packages

| Package | Contents | Runs on |
| --- | --- | --- |
| `@sagegames/types` | Shared types: the `GameRules` contract, action logs, API responses | everywhere |
| `@sagegames/engine` | Seeded random generator, the `Play` loop, action-log parsing, `replay()` | client **and** server |
| `@sagegames/game-*` (5 games) | Each game's rules as a pure reducer, plus its content (question bank, dictionary, dice, Sudoku variants) | client **and** server |
| `@sagegames/core` | HTTP client, `GameRuntime` (plays a game and records moves), `SessionController` (session → play → submit → result) | client |
| `@sagegames/react-headless` | Provider, theme, labels, `useLauncher`, and interaction hooks for each game | React (web and native) |
| `@sagegames/react-native` | React Native views, launcher, results, leaderboard | iOS / Android / Expo |
| `@sagegames/react` | DOM views, launcher, results, leaderboard | web |
| `services/api` | Express API: sessions, replay, leaderboards, battles, portal accounts and API, webhooks, migrations | any host (Docker, Railway…) |
| `services/portal` | Developer portal (React + Vite), served by the API at `/portal` | same process |

Game packages contain no React code, so the API imports exactly the same rules the SDK plays with.

## Trust model: scores come from a replay, never from the client

```text
 POST /v2/sessions (host, API key)  →  server picks a random seed, validates config, stores both
 GET  /play       (session token)   →  { seed, config, rulesVersion }
      client: state = rules.init(seed, config); each move → Play.apply(t, move); records [t, type, payload]
 POST /complete   { log }            →  server: replay(rules, { seed, config, log, serverElapsedMs })
                                         → authoritative score, stored once; leaderboard; webhook
```

- **Determinism.** Rules are pure reducers that take time as an argument and get randomness only from the seed (cyrb128 → sfc32, 32-bit integer maths). The same seed and moves produce the same state in V8, Hermes and Node. Golden-value tests guard against drift.
- **One loop, two places.** The client (`GameRuntime`) and the server (`replay`) both drive the engine's `Play` class. Pauses are handled there: rules only ever see active play time. Timer transitions are composable, so ticks the client never logged still replay identically; a property test checks this.
- **Hard rejects** (the result is stored as `rejected`, never ranked):
  - a malformed log
  - timestamps going backwards
  - unknown or malformed moves
  - more moves than the game's limit
  - a log claiming more time than the server saw pass since `/start`
  - a game or rules-version mismatch
- **Soft flags** (the result is stored, but not ranked): moves faster than a human could make, a compressed timeline, and game-specific checks such as a perfect quiz answered in under 0.8 s per question.
- **Time limits end games; they don't reject them.** An app backgrounded past a timer still verifies, capped at the limit.
- **Limits.** The server's replay makes it impossible to *invent* a score. In a solo game it can't stop a modified client from reading the puzzle from memory, since the seed and state are on the device, and playing it perfectly. Plausibility flags catch the obvious cases. In battles, games with hidden information (Memory's card faces, Quiz's answers) never send the seed at all: the server plays the game and each player only receives what they may see (see [Battles](#battles-race-mode)). The other three games have nothing to hide: a Sudoku, word grid or letter grid can be solved from what's on screen.

### Rules versions

Every session records the `rulesVersion` of its game. Anything that changes how a seed plays requires bumping `rulesVersion` in that game's `rules.ts` and releasing a new SDK. That includes the question bank, the dictionary, generation and scoring. Snapshot tests fail when a fixed seed's puzzle changes, as a reminder.

An SDK whose version differs from the server's gets `426 sdk_update_required`, and the launcher asks the player to update the app.

## Battles (race mode)

A match gives every player the same seed and config. Each seat is an ordinary `game_sessions` row (mode `match`), so a battle result is stored, ranked and reported exactly like a solo one.

- **Transport.** WebSocket at `/v2/ws` on the API server. The first message must be `{type:'auth', token}` within 5 s; the token never goes in the URL.
- **The server applies moves live.** Each `action` runs through the same rules as the client, with its time clamped to `[previous move, time the server has seen pass]`. A client can't backdate moves or claim to be faster than the server saw. Illegal moves are answered with `reject` and ignored.
- **Match room.** One `MatchRoom` per live match, in memory, runs the lobby, the countdown, a 4-per-second progress broadcast, the 30-second grace for disconnects (then forfeit) and the time limit. At the end, one transaction stores each player's replayed result, the standings and the `match.finished` webhook.
- **Hidden information.** Games that define `rules.view(state)` (Memory and Quiz) get no seed or config in `welcome`. The server keeps the full state and sends each player their own `view` in `state` messages: after each of their moves, when a timer changes something (a quiz question timing out), and on reconnect. Memory shows only matched and currently revealed faces; Quiz shows a question's answer only once it has been answered or has timed out, and later questions not at all. The app renders these views with a `RemoteRuntime`, so the views and hooks are the same as in solo play. Flips and answers take one round trip to show, which is fine for these two games.
- **Reconnect.** `welcome` carries the moves the server already applied (or, for hidden-information games, the player's current view), and the client rebuilds its game from them, so the server's view always wins.
- **Ranking.** Each game's `rules.race` is either `time_then_score` (Sudoku, Word Search, Memory: first to solve) or `score_then_time` (Quiz, Word Rush). Forfeits rank last.
- **Single instance.** Rooms aren't shared between servers, so a deployment runs one API process (each process records a heartbeat and warns if it sees another). Rooms broadcast through a `MatchBus` (in memory today), the seam where a Redis pub/sub bus can spread battles across instances later. On startup, matches left in `countdown` or `in_progress` are marked `aborted`; lobbies are reloaded from the database when someone connects.
- **Proxies.** The server pings every socket every 25 seconds (inside Railway's, Render's and typical load balancers' idle timeouts) and closes sockets that stop answering. Nothing live goes through the database: no listeners, no polling.

## Data (any SQL database: Postgres, MySQL 8 / MariaDB, SQLite)

Every table is named `sagegames_*` (shown here without the prefix).

```text
users ─┬─ refresh_tokens                        (portal sessions: hashed, rotated)
       └─ auth_tokens                           (email verification, password reset, email change)
tenants ─┬─ tenant_members ── users             (portal accounts)
         ├─ api_keys                            (sk_live_/sk_test_, HMAC-SHA256 + pepper)
         ├─ tenant_game_access ── games         (enabled games + per-app default config)
         ├─ quiz_banks
         ├─ game_sessions ─┬─ session_logs      (the submitted move log + hash)
         │                 └─ game_results      (verified/rejected, score, flags, is_valid)
         ├─ player_stats
         ├─ matches ── match_players ── game_sessions   (battles: one seat = one session)
         └─ webhook_deliveries                  (outbox, retried with backoff)
```

- **One query layer for every dialect.** Queries are written once with Kysely; the dialect comes from the `DATABASE_URL` scheme. Timestamps are computed by the app and stored in UTC; JSON is `jsonb` on Postgres and text elsewhere, always through one serialiser, and never queried inside. Upserts, row locks and the webhook claim have one helper each with a branch per dialect.
- **Migrations** are TypeScript, one set for all dialects (`services/api/src/db/migrations`), applied under a lock (an advisory lock on Postgres, `GET_LOCK` on MySQL, SQLite's single writer). Access control lives in the API: there are no database roles or row policies to manage, and no public data API to protect.
- Leaderboards are computed from `game_results` with window functions (each player's best valid score via `ROW_NUMBER()`, ranked with `RANK()`), filtered by tenant, game, period and `context_id`. Hosts use `context_id` for per-chat or per-group boards.
- Completion is one transaction. It locks the session (`FOR UPDATE` on Postgres and MySQL; SQLite has a single writer), is idempotent for the same log hash, and refuses a second, different log.
- The webhook worker claims due deliveries with `FOR UPDATE SKIP LOCKED` (Postgres, MySQL 8) or a guarded `UPDATE` per row (SQLite), pushing `next_attempt_at` forward as a lease, so two workers never send the same delivery.

## Credentials

| Credential | Holder | Scope |
| --- | --- | --- |
| API key `sk_live_…` / `sk_test_…` | host backend | create sessions, read results, leaderboards and stats for its own app |
| Session token `stk_…` | player's app | one session: play, start, complete, and that session's leaderboard; 1 hour |
| Portal access token (JWT, 15 minutes) and refresh cookie | developer in the portal | manage apps they belong to |
| Webhook secret `whsec_…` | host backend | verify `Sage-Signature` |

Keys and session tokens are stored only as hashes. Test-key results never reach leaderboards or webhooks.

### Portal accounts

- Passwords are hashed with scrypt (per-password salt; parameters stored with the hash). The rule is at least 10 characters with upper and lower case letters and a digit.
- Signing in gives a short-lived access token (HS256 JWT signed with `AUTH_JWT_SECRET`), kept in memory by the portal, and a refresh token in an `httpOnly`, `Secure`, `SameSite=Lax` cookie scoped to `/portal`. Refresh tokens are stored hashed and rotated on every use; presenting a spent one revokes its whole family. Routes that read the cookie also require an `X-Requested-With` header, which a cross-site form can't send.
- Access tokens carry the account's token epoch. Changing the password, resetting it or signing out everywhere bumps the epoch, so every older session stops working at once.
- Email verification, password reset and email change use single-use random tokens, stored hashed (24 hours for verification, 1 hour for reset).
- Sign-up, sign-in, forgot-password and verification resends are rate-limited per IP and per email. Sign-up and forgot-password answer the same whether or not the address has an account.
- Emails go through Brevo's API; without a key, development logs the links instead.

## Runtime

- The API runs in one Node 22 process (Docker image, Railway config included). On startup it applies pending migrations when started with `--migrate` (and otherwise refuses to start while any are pending), syncs the catalog from code, creates any bootstrap tenants, and starts the webhook worker, which polls the outbox every 5 s. `/healthz` reports the database dialect and whether migrations are current.
- Rate limits: per API key on host routes, per IP on player routes, and stricter on `/complete` and key creation.
- CORS is open on `/v1` and `/v2`, which use bearer tokens only, and closed on the portal API.

## Logging and error reporting

- **Logs** are one JSON object per line in production (`LOG_FORMAT=json`; the host collects stdout) and readable lines locally. Each request gets one line with `requestId`, method, path (no query string), status, time and tenant. The id comes from a sane incoming `X-Request-Id` or is generated, and is returned in the `X-Request-Id` response header, so a host can quote it when something goes wrong.
- **Redaction** happens before anything is written or reported: fields named like `authorization`, `token`, `secret`, `password`, `apiKey`… are replaced, and anything shaped like a credential this platform issues (`sk_live_…`, `sk_test_…`, `stk_…`, `whsec_…`, `Bearer …`), or a password in a connection string, is masked wherever it appears in text.
- **Error reporting.** Every error-level entry that carries an error (unhandled request errors, match results that couldn't be saved, webhook worker failures, uncaught exceptions) goes to Sentry when `SENTRY_DSN` is set, tagged with `requestId`, `component`, `matchId` and `tenantId` where known. Sentry's automatic collection of headers, cookies, bodies, query strings, user info, database query data and local variables is switched off, and events are scrubbed again before sending.

## Testing

| Layer | How |
| --- | --- |
| Engine and games | Vitest: golden values, determinism snapshots, live-vs-replay parity, property tests with fast-check, and a regression test per known bug |
| API | Vitest + supertest, the whole suite once per database: SQLite and **PGlite** (real Postgres in WASM) locally, plus MySQL 8, MariaDB and Postgres servers in CI. Each test gets a fresh, migrated database. Covers leaderboard ties, the webhook claim with concurrent workers, account flows and moving a 2.x export |
| Full flow | `npm run test:flow`: the production server on a real database, sign-up to verified game in a real browser |
| SDK ↔ API | `SessionController` against the real API over HTTP: offline recovery, retries, SDK version mismatch |
| Battles | Vitest against the real WebSocket server with short timers: lobby → standings, group joins, lobby timeout, forfeit after the grace period, resume after reconnect, move-time clamping, tenant isolation, plus the SDK's `MatchController` racing and reconnecting, and that Memory faces and Quiz answers never reach a player before they're revealed |
| Logging | Vitest: JSON lines, levels, redaction of credentials and connection-string passwords, request ids, 500s logged with the request id and handed to the error reporter |
| UI | `npm run test:ui`: Playwright plays every game in both SDKs (React Native through react-native-web) with clicks, drags and taps, and checks the verified result screen. `npm run test:battle` races two players through the real API. Both run in CI and upload screenshots. |
