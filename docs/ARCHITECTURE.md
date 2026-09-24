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
| `services/api` | Express API: sessions, replay, leaderboards, portal API, webhooks | Render |
| `services/portal` | Developer portal (React + Vite, Supabase Auth), served at `/portal` | Render |
| `supabase/` | Database migrations and Auth settings | Supabase |

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
- **Limits.** The server's replay makes it impossible to *invent* a score. It can't stop a modified client from reading the puzzle from memory, since the seed and state are on the device, and playing it perfectly. Plausibility flags catch the obvious cases; server-revealed hidden information (a later phase) closes the rest for battles.

### Rules versions

Every session records the `rulesVersion` of its game. Anything that changes how a seed plays requires bumping `rulesVersion` in that game's `rules.ts` and releasing a new SDK. That includes the question bank, the dictionary, generation and scoring. Snapshot tests fail when a fixed seed's puzzle changes, as a reminder.

An SDK whose version differs from the server's gets `426 sdk_update_required`, and the launcher asks the player to update the app.

## Battles (race mode)

A match gives every player the same seed and config. Each seat is an ordinary `game_sessions` row (mode `match`), so a battle result is stored, ranked and reported exactly like a solo one.

- **Transport.** WebSocket at `/v2/ws` on the API server. The first message must be `{type:'auth', token}` within 5 s; the token never goes in the URL.
- **The server applies moves live.** Each `action` runs through the same rules as the client, with its time clamped to `[previous move, time the server has seen pass]`. A client can't backdate moves or claim to be faster than the server saw. Illegal moves are answered with `reject` and ignored.
- **Match room.** One `MatchRoom` per live match, in memory, runs the lobby, the countdown, a 4-per-second progress broadcast, the 30-second grace for disconnects (then forfeit) and the time limit. At the end, one transaction stores each player's replayed result, the standings and the `match.finished` webhook.
- **Reconnect.** `welcome` carries the moves the server already applied, and the client rebuilds its game from them, so the server's view always wins.
- **Ranking.** Each game's `rules.race` is either `time_then_score` (Sudoku, Word Search, Memory: first to solve) or `score_then_time` (Quiz, Word Rush). Forfeits rank last.
- **Single instance.** Rooms aren't shared between servers. On startup, matches left in `countdown` or `in_progress` are marked `aborted`; lobbies are reloaded from the database when someone connects.

## Data (Supabase Postgres, `sagegames` schema)

```text
tenants ─┬─ tenant_members ── auth.users        (portal accounts, Supabase Auth)
         ├─ api_keys                            (sk_live_/sk_test_, HMAC-SHA256 + pepper)
         ├─ tenant_game_access ── games         (enabled games + per-app default config)
         ├─ quiz_banks
         ├─ game_sessions ─┬─ session_logs      (the submitted move log + hash)
         │                 └─ game_results      (verified/rejected, score, flags, is_valid)
         ├─ player_stats
         ├─ matches ── match_players ── game_sessions   (battles: one seat = one session)
         └─ webhook_deliveries                  (outbox, retried with backoff)
```

- The schema isn't exposed to Supabase's Data API, and RLS is enabled with no policies. Only the API, connecting as the owner, touches it.
- Leaderboards are computed from `game_results`: each player's best valid score, ranked with `RANK()`, filtered by tenant, game, period and `context_id`. Hosts use `context_id` for per-chat or per-group boards.
- Completion is one transaction. It locks the session with `FOR UPDATE`, is idempotent for the same log hash, and refuses a second, different log.

## Credentials

| Credential | Holder | Scope |
| --- | --- | --- |
| API key `sk_live_…` / `sk_test_…` | host backend | create sessions, read results, leaderboards and stats for its own app |
| Session token `stk_…` | player's app | one session: play, start, complete, and that session's leaderboard; 1 hour |
| Supabase access token | developer in the portal | manage apps they belong to |
| Webhook secret `whsec_…` | host backend | verify `Sage-Signature` |

Keys and session tokens are stored only as hashes. Test-key results never reach leaderboards or webhooks.

## Runtime

- The API runs on Render (Node 22). On startup it checks the schema exists, syncs the catalog from code, creates any bootstrap tenants, and starts the webhook worker, which polls the outbox every 5 s.
- Rate limits: per API key on host routes, per IP on player routes, and stricter on `/complete` and key creation.
- CORS is open on `/v1` and `/v2`, which use bearer tokens only, and closed on the portal API.

## Testing

| Layer | How |
| --- | --- |
| Engine and games | Vitest: golden values, determinism snapshots, live-vs-replay parity, property tests with fast-check, and a regression test per known bug |
| API | Vitest + supertest against **PGlite** (real Postgres in WASM) with the same Supabase migrations |
| SDK ↔ API | `SessionController` against the real API over HTTP: offline recovery, retries, SDK version mismatch |
| Battles | Vitest against the real WebSocket server with short timers: lobby → standings, group joins, lobby timeout, forfeit after the grace period, resume after reconnect, move-time clamping, tenant isolation, plus the SDK's `MatchController` racing and reconnecting |
| UI | `npm run test:ui`: Playwright plays every game in both SDKs (React Native through react-native-web) with clicks, drags and taps, and checks the verified result screen. `npm run test:battle` races two players through the real API. Both run in CI and upload screenshots. |
