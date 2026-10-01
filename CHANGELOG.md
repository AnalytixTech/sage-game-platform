# Changelog

All public packages share one version. Platform (server) releases are listed with them; a platform release that needs no SDK change, like 3.0, leaves the packages' version alone.

## Platform 3.0.0

Self-host anywhere, on any SQL database, with no Supabase. **SDK 2.x apps work unchanged:** the HTTP API, the battle WebSocket protocol, webhooks and their signatures are the same. The SDK packages stay at 2.3.

**Any database**

- `DATABASE_URL` chooses Postgres (`postgres://`), MySQL 8 / MariaDB 10.6+ (`mysql://`) or SQLite (`sqlite:./data/sagegames.db`, built into Node: no native module).
- Every query moved to Kysely, written once for all three. Tables are named `sagegames_*`, with no schema or `search_path`, so transaction poolers work.
- Migrations are TypeScript, one set for every dialect, applied under a lock: `npm run db:migrate`, the Railway pre-deploy command, or `server.js --migrate`. The server refuses to start while migrations are pending.
- `/healthz` reports the database and whether migrations are current.
- The full API suite runs on SQLite, Postgres, MySQL and MariaDB in CI, covering leaderboard ties and the webhook claim with concurrent workers.

**Portal accounts, built in**

- Sign-up with email confirmation, sign-in, forgot and reset password, change password, change email (with re-confirmation), sign out everywhere, and delete account, all at `/portal/api/auth/*`.
- Passwords are hashed with scrypt.
- Sessions use a short-lived access token plus a rotating refresh token in an `httpOnly` cookie; reusing a spent token signs the session out.
- Rate limits apply per IP and per email, and sign-up and password reset answer the same whether or not an account exists.
- Emails are sent by the API through Brevo (`BREVO_API_KEY`, `EMAIL_FROM`), with the same templates. Without a key, development logs the links.
- `create-user` creates the first owner without email; `claim-tenant` gives an account an existing app.

**Deploy anywhere**

- A production `Dockerfile`: multi-stage, non-root, with a health check, migrations on start and a volume for SQLite.
- A `railway.json` with pre-deploy migrations, a health check, restart on failure and one replica.
- Docker on a shared VPS: `compose.yml` with the following, documented in [Docker deployment](docs/DOCKER.md):
  - no published ports, the shared `proxy` network, an optional bundled Postgres profile and a one-off migrate service
  - resource and PID limits, a read-only root filesystem, no capabilities and rotated logs
  - Caddy and nginx examples (WebSockets included)
- A Docker CI workflow that builds and runs the image on SQLite and Postgres, then pushes it to GHCR from `main`.
- The image's default command no longer migrates on start: run migrations as a separate step, or add `--migrate`.
- A new self-hosting guide covering Docker, Railway step by step, choosing a database, configuration, custom domains, email, backups per database and the one-instance rule.
- Battles keep running on the platform's own WebSocket server, now with a 25-second heartbeat (inside proxy idle timeouts) and a `MatchBus` seam for multi-instance support later. The server warns when a second instance shares the database.
- New settings: `DATABASE_URL` (any scheme), `DATABASE_POOL_SIZE`, `AUTH_JWT_SECRET`, `BREVO_API_KEY`, `EMAIL_FROM`, `RELEASE`. Removed: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`.

**Moving from 2.x**

- `export-supabase` reads the old deployment (the `sagegames` schema, plus portal accounts' emails), and `import` loads it into a fresh database of any dialect.
- API keys keep working with the same `API_KEY_PEPPER`; accounts set a new password from an emailed link on first sign-in.
- See [Moving a 2.x deployment](docs/MOVING_TO_3.md).

## 2.3.0

Additive: nothing breaks, and `reviewBeforeResult={false}` restores the 2.2 flow exactly.

**Review before the result**

- When a game ends (completed, time up or quit), the finished board stays on screen, read-only, with the score, the time, a key stat and a **Continue** button. Verification starts immediately in the background and shows its status inline ("Checking your score…", "Retrying…"); Continue shows the result, or the checking screen first if it's still running. "Play again" starts fresh.
- Battles too: your finished board → Continue → waiting or standings.
- New props on `GameLauncher` and `MatchLauncher` (both SDKs): `reviewBeforeResult` (default `true`) and `renderReview`. New label `continue`, slot style `review`. `useLauncher` and `useMatch` return `view` and `review`.
- The submitted moves and end time are unchanged; `onComplete` fires as soon as the server answers.

**Word Search definitions**

- Tap a found word's letters, or its chip, to see its `definition` and `note` in a themed popup (dismiss with **Got it**, the backdrop, Escape or Android back). Works during play and on the review board. Unfound words give no hint.
- The tap rule keeps selection intact: with a selection started, a tap still completes or cancels it; drags are unchanged. No new moves reach the replay and the clock is not paused.
- New `WordDefinition` slot, `wordDefinition` slot style, labels `gotIt` and `definitionHint`, and the provider's `onWordDefinition({ gameId, word })` callback. Found chips are buttons with an accessibility hint; the popup is announced and keeps focus.

**Docs**

- `@sagegames/react-native` and `@sagegames/react` now ship a README and this changelog.
- The documentation is public as plain Markdown for people and tools: `/portal/docs/llms.txt` lists every page and `/portal/docs/<page>.md` serves it (e.g. `/portal/docs/sdk.md`). The portal's docs pages stay readable without signing in.

## 2.2.0

**Design and UX**

- New default look, the **arcade** theme: depth, gradients, springy motion and celebrations. `darkNavyTheme` and `lightTheme` keep their colours with the new depth; `minimalTheme` is flat and calm. **Visible change:** apps that didn't pass `theme` now get the arcade look; pass `theme={darkNavyTheme}` to keep the 2.x navy look.
- `createTheme({ brand })` builds a complete theme from one colour with WCAG AA contrast guaranteed.
- New theme tokens: elevation, gradients, typography, motion, density, game accents, found-word palette. Themes are deep-merged; tokens derived from colours follow them. 2.1-style themes keep working.
- Every game redesigned with motion: 3D card flips, pops and shakes, word capsules, a Word Rush path line, Sudoku row/column/box sweeps, floating points, confetti. The OS "reduce motion" setting is respected.
- Launcher: intro hero, 3-2-1 before timed games, animated header, pause and quit sheets, a new results screen with count-up, rank chips, medals and confetti. Battles: avatars, a live standings strip and a podium.
- Haptics and sounds through a `feedback` adapter (`expoHapticsFeedback`, `webVibrationFeedback`).
- Developer control: `slotStyles`, slot `components` (Button, IntroCard, ResultHero, LeaderboardRow, Countdown), `renderIntro`/`renderResult`/`renderSubmitting`/`renderError`, `useGameEvents`, and the `ui` building blocks for custom views.

**Developer portal**

- Redesigned portal with a sidebar, an app overview (setup checklist, usage sparklines, recent results), toasts and modals, and dark/light themes.
- **Theme Studio** (Design): preview every game live with any preset or brand colour, and copy the code.
- **Documentation** built into the portal, with search, an API reference and code you can copy.

## 2.1.0

- **Battles**: 2 to 16 players race the same puzzle live over WebSockets; the server applies every move. `MatchLauncher`, `useMatch`, `match.finished` webhooks.
- Hidden information in battles: Memory card faces and Quiz answers stay on the server until revealed.
- Quiz banks in the portal (paste from a spreadsheet).
- Structured logs with secret redaction, request ids, and optional Sentry reporting.

## 2.0.0

- Scores are computed by the server from a replay of the player's moves (no more client-reported scores).
- Playable React Native and web SDKs for all five games; `GameLauncher` with retries and a pending-result store.
- Postgres-backed v2 API, developer portal with self-service API keys, per-context leaderboards, signed webhooks.
