# SageGames developer guide (SDK 2.1)

This guide covers adding SageGames to a React Native / Expo or React web app. You get five playable games — Quiz Master, Memory Match, Sudoku Arena, Word Search and Word Rush — with scores the server verifies, leaderboards, webhooks and [online battles](#online-battles-sdk-21) between two or more players.

For a complete worked integration, see [guides/JAPABUDZ_INTEGRATION.md](guides/JAPABUDZ_INTEGRATION.md).

## How it fits together

```text
 Your app                     Your backend                    SageGames API
 ─────────                    ────────────                    ─────────────
 GameLauncher ── getSession ─▶ POST /your/games/session ──────▶ POST /v2/sessions  (API key)
      │                        ◀── { sessionId, sessionToken } ◀──┘
      │
      ├── GET  /v2/sessions/:id/play      (session token) → seed + config
      ├── POST /v2/sessions/:id/start
      │      … the player plays locally; every move is recorded …
      └── POST /v2/sessions/:id/complete  { log } → server replays the moves → verified score
                                                        │
 Your backend ◀── webhook: session.completed (signed) ──┘
```

- The **API key** stays on your backend. Your app only ever holds a **session token**, which covers one game and lasts one hour.
- The app **never reports a score**. It sends the list of moves, and the server replays them with the same game code to compute the score. See [ARCHITECTURE.md](ARCHITECTURE.md).

## 1. Get an API key

Sign up at `https://<api-host>/portal/`, create an app, choose its games and create a key. See [KEYS_SETUP.md](KEYS_SETUP.md) for key handling and rotation.

## 2. Add a session endpoint to your backend

```ts
app.post('/api/games/session', requireUser, async (req, res) => {
  const r = await fetch(`${process.env.SAGEGAMES_API_URL}/v2/sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SAGEGAMES_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gameId: req.body.gameId,
      externalUserId: req.user.id,      // your user id
      displayName: req.user.name,       // shown on leaderboards
      contextId: req.body.contextId,    // optional: "group:42", "dm:7"… one leaderboard per context
      config: {},                       // optional per-game settings (see "Game configuration")
    }),
  });
  const body = await r.json();
  if (!r.ok) return res.status(502).json({ error: 'Could not start the game' });
  res.json({ sessionId: body.sessionId, sessionToken: body.sessionToken });
});
```

A complete runnable version, including webhook verification, is in [examples/host-backend/server.ts](../examples/host-backend/server.ts).

## 3a. React Native / Expo

```bash
npm install @sagegames/react-native
```

No native modules and no Expo config plugin are needed. It works with React Native 0.72+ and React 18/19.

```tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { allGames, darkNavyTheme, GameLauncher, SageGameProvider } from '@sagegames/react-native';

export function Root() {
  return (
    <SageGameProvider games={allGames} baseUrl="https://sage-game-platform.onrender.com" theme={darkNavyTheme} pendingStore={AsyncStorage}>
      <Navigation />
    </SageGameProvider>
  );
}

export function PlayScreen({ gameId, onDone }: { gameId: string; onDone: () => void }) {
  return (
    <GameLauncher
      getSession={() => api.post('/api/games/session', { gameId }).then((r) => r.data)}
      onComplete={(result) => console.log('verified', result.score, result.rank)}
      onClose={onDone}
    />
  );
}
```

## 3b. React (web)

```bash
npm install @sagegames/react
```

```tsx
import { allGames, GameLauncher, lightTheme, SageGameProvider } from '@sagegames/react';

<SageGameProvider games={allGames} baseUrl="https://sage-game-platform.onrender.com" theme={lightTheme} pendingStore={window.localStorage}>
  <GameLauncher getSession={() => startSession('game_sudoku_001')} onClose={close} />
</SageGameProvider>
```

The web views use the DOM, not react-native-web. Grids use CSS grid, drags use pointer events, and Sudoku can be played with the keyboard (arrow keys, digits, Backspace, and N for notes).

## Components and hooks

The same API is exported by `@sagegames/react-native` and `@sagegames/react`.

| Export | What it does |
| --- | --- |
| `SageGameProvider` | Required at the root. Props: `games` (usually `allGames`), `baseUrl`, `theme`, `themeOverrides`, `labels`, `pendingStore`, `fetch`. |
| `GameLauncher` | The whole flow: intro → game → verified result + leaderboard, with pause, quit, retries and "Play again". Props: `getSession` (preferred) or `session`, `onComplete`, `onError`, `onEvent`, `onClose`, `autoStart`, `showLeaderboard`, `renderHeader`, `hideChrome`. |
| `GameCatalog` | List of games the app can play. `onSelectGame(game)`. |
| `GamePreview` | Plays a game locally with no session, for demos and tutorials. Scores aren't submitted. |
| `LeaderboardList` / `useLeaderboard(session, { scope })` | Leaderboard for a session's context (`scope: 'context'`, the default) or the whole app (`'game'`). |
| `useLauncher(options)` | Build your own launcher UI on top of the same flow. |
| `useGames()` | Catalog data. |
| `allGames`, `quizMaster`, `memoryMatch`, `sudoku`, `wordSearch`, `wordRush` | Game plugins (rules + view). Pass a subset to `games` to offer fewer games. |

`GameLauncher` calls `onComplete` **once**, with the server's result:

```ts
{
  sessionId, gameId,
  status: 'verified' | 'rejected',
  valid: boolean,          // counts on leaderboards
  score, durationMs, rank, // rank within the session's context
  result,                  // game-specific stats (e.g. { wordsFound, totalWords })
  flags,                   // plausibility flags, if any
}
```

`onEvent` also reports `loaded`, `started`, `paused`, `resumed`, `ended`, `completed` and `error` for analytics.

### Reliability

- **Network drops at the end of a game.** The result is retried with backoff. With a `pendingStore` (AsyncStorage or localStorage), an unsent result survives the app closing and is submitted the next time that session loads.
- **App backgrounded or tab hidden.** Games that allow pausing (Memory, Sudoku, Word Search) pause. Timed games (Quiz, Word Rush) keep running, and if time runs out while away, the game ends normally and the result still verifies.
- **Outdated app.** If the server has newer game rules than the SDK, the launcher shows "Please update the app" instead of a broken game.

## Theming and labels

Start from `lightTheme` or `darkNavyTheme` and override anything:

```tsx
<SageGameProvider
  games={allGames}
  theme={darkNavyTheme}
  themeOverrides={{
    colors: { primary: '#BA8109', background: '#000B21' },
    radii: { md: 12 },
    fonts: { regular: 'Montserrat-Regular', medium: 'Montserrat-SemiBold', bold: 'Montserrat-Bold' },
  }}
  labels={{ play: 'Start', yourScore: 'Your points' }}
/>
```

The colour tokens are `background`, `surface`, `surfaceAlt`, `border`, `text`, `textMuted`, `primary`, `onPrimary`, `success`, `danger`, `warning`, `highlight`, `cellSelected`, `cellPeer` and `cellConflict`. Every user-facing string is in `labels`; see `defaultLabels` for the full list.

Keep `themeOverrides` and `labels` outside render, or memoise them.

## Game configuration

Send `config` when creating a session, or set per-app defaults on the platform. The server validates it and answers `400 invalid_config` with the offending field.

| Game (`gameId`) | Config |
| --- | --- |
| Quiz Master (`game_quiz_001`) | `questionCount` (1–50, default 10), `timePerQuestionSec` (5–120, default 20), `difficulty` (`easy`/`medium`/`hard`/`mixed`), `categories` (`general`, `science`, `geography`, `history`, `technology`, `sports`, `travel`, `maths`, `culture`), `questions` (your own, see below), `includeDefaultQuestions`, `bankId` |
| Memory Match (`game_memory_001`) | `pairCount` (2–12, default 6) |
| Sudoku Arena (`game_sudoku_001`) | `variant` (`4x4`, `4x4_irregular`, `5x5_irregular`, `6x6`, `6x6_irregular`, `7x7_irregular`, `8x8`, `8x8_irregular`, `9x9`), `difficulty`, `timeLimitSeconds` (0 = none) |
| Word Search (`game_word_search_001`) | `words: [{ token, display?, definition? }]` (up to 30), `wordSelectionMode` (`custom_only`/`default_only`/`combine`), `categoryName`, `gridSize` (6–15; grows to fit the longest word), `difficulty` (hard adds backwards and diagonal words) |
| Word Rush (`game_word_001`) | `size` (4 or 5), `durationSeconds` (30–300, default 90) |

**Custom quiz questions.** Send them inline:

```json
{ "questions": [{ "question": "What does BRP stand for?", "answer": "Biometric Residence Permit", "wrong": ["British Rail Pass", "Border Return Paper"] }] }
```

Or store a bank once and refer to it by id:

```bash
curl -X PUT $API/v2/quiz-banks/relocation -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"name":"Relocation","questions":[…]}'
# then create sessions with  "config": { "bankId": "relocation" }
```

## Server API for your backend (API key)

| Endpoint | Purpose |
| --- | --- |
| `POST /v2/sessions` | Start a game (see above). |
| `GET /v2/sessions/:id` | Session status, metadata and verified result. |
| `GET /v2/results?externalUserId=&gameId=&contextId=&since=&limit=` | Recent results, for rewards and history. |
| `GET /v2/leaderboards/:gameId?contextId=&period=all_time\|daily\|weekly\|monthly&limit=&offset=` | Best verified score per player. |
| `GET /v2/users/:externalUserId/stats` | Totals and per-game stats. |
| `PUT/GET/DELETE /v2/quiz-banks/:bankId`, `GET /v2/quiz-banks` | Custom question banks. |
| `GET /v2/games` | Catalog (public; with a key, only your app's games). |

Webhooks (`session.completed`) are signed with `Sage-Signature: t=<unix>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`. Verify the signature against the raw body. The example backend has a ready-made verifier.

**v1:** `/v1/*` still works for SDK 1.x apps, but its client-reported scores are stored as unverified and never ranked. Move to v2.

## Online battles (SDK 2.1)

In a battle, 2 to 16 players get **the same puzzle** and race it live. Each player sees everyone's progress as it happens, and the final standings at the end. The server applies every move as it arrives, so a battle result can't be faked any more than a solo one.

```text
 Your backend                                 SageGames API
 ────────────                                 ─────────────
 POST /v2/matches { gameId, players } ───────▶ match in "lobby"
 POST /v2/matches/:id/tokens { externalUserId } ─▶ { matchId, playerId, playerToken }   (one per player)

 Each player's app
 ─────────────────
 MatchLauncher seat={{ matchId, playerToken }} ──WebSocket /v2/ws──▶ lobby → countdown → race → standings

 Your backend ◀── webhooks: session.completed (per player, with matchId) + match.finished (standings)
```

### How a battle is decided

| Game | Winner |
| --- | --- |
| Sudoku, Word Search, Memory Match | First to solve the puzzle. Players who haven't solved it when the time runs out rank below everyone who did, ordered by score, then progress. |
| Quiz Master, Word Rush | Highest score. The faster time breaks ties. |

A player who leaves, or stays disconnected for more than **30 seconds**, forfeits and ranks last. Every player's result is also stored as a normal verified result, so it counts on leaderboards and in player stats.

### 1. Create the match on your backend

```ts
// Two people in a DM: an invite-only match.
const match = await sage('POST', '/v2/matches', {
  gameId: 'game_sudoku_001',
  players: [
    { externalUserId: me.id, displayName: me.name },
    { externalUserId: friend.id, displayName: friend.name },
  ],
  contextId: `dm:${conversationId}`,
  config: { variant: '6x6' },       // same options as solo sessions
});

// A group chat: open to members until the lobby closes.
const match = await sage('POST', '/v2/matches', {
  gameId: 'game_word_001',
  players: [{ externalUserId: me.id, displayName: me.name }],
  allowJoin: true,
  minPlayers: 2,
  maxPlayers: 8,
  lobbyTimeoutSec: 120,
  contextId: `group:${groupId}`,
});
```

| Field | Default | Meaning |
| --- | --- | --- |
| `players` | `[]` | Players seated up front. Without `allowJoin` there must be at least `minPlayers`. |
| `allowJoin` | `false` | Anyone you add with `POST /v2/matches/:id/players` can take a seat while the lobby is open. |
| `minPlayers` / `maxPlayers` | 2 / 2 (8 with `allowJoin`) | Between 2 and 16. |
| `lobbyTimeoutSec` | 120 | When the lobby closes: the race starts with whoever is ready (if that's at least `minPlayers`), otherwise the match is cancelled. |

The race starts early, after a 3-second countdown, as soon as every seated player is ready.

### 2. Give each player their seat

A seat token lets one player into one match. Mint it when that player opens the match, and send it only to them:

```ts
app.post('/api/battles/:matchId/seat', requireUser, async (req, res) => {
  // Invite-only: tokens. Open lobby: players (adds the seat if needed, then returns its token).
  const path = openLobby ? 'players' : 'tokens';
  const seat = await sage('POST', `/v2/matches/${req.params.matchId}/${path}`, {
    externalUserId: req.user.id,
    displayName: req.user.name,
  });
  res.json({ matchId: seat.matchId, playerToken: seat.playerToken });
});
```

Minting a new token for a player cancels their previous one, so a player can only be connected from one device at a time.

### 3. Show the battle in the app

```tsx
import { MatchLauncher } from '@sagegames/react-native'; // or '@sagegames/react'

<MatchLauncher
  getSeat={() => api.post(`/api/battles/${matchId}/seat`).then((r) => r.data)}
  onFinished={(standings) => console.log('winner', standings[0].displayName)}
  onClose={close}
/>
```

`MatchLauncher` handles the lobby (with a "ready" button), the countdown, the game with a live progress bar for each player, a "waiting for the others" screen once you finish, and the final standings. If the connection drops, it reconnects and carries on from the last move the server has. For your own UI, `useMatch({ getSeat })` returns the same state (`phase`, `match`, `runtime`, `standings`) with `ready()`, `forfeit()` and `retry()`.

### Match API (API key)

| Endpoint | Purpose |
| --- | --- |
| `POST /v2/matches` | Create a match (above). Returns the match view. |
| `GET /v2/matches/:id` | Status, players (connected, progress, score) and final `standings`. |
| `POST /v2/matches/:id/tokens` | `{ externalUserId }` → a seat token for a seated player. |
| `POST /v2/matches/:id/players` | `{ externalUserId, displayName? }` → take a seat in an open lobby, then return its token. Errors: `invite_only`, `match_full`, `match_started`. |

The `match.finished` webhook carries `{ matchId, gameId, contextId, standings, finishedAt }`. Each standing has `rank`, `externalUserId`, `displayName`, `status` (`finished`, `forfeited`…), `score`, `completed` and `finishedMs`. Matches created with a test key send no webhooks.

### Limits

- Battles run on a single API instance and live in memory while they're played. A server restart **aborts** any battle in progress (status `aborted`); lobbies survive.
- On Render, use a paid plan: a sleeping free instance drops every open connection.
- The WebSocket accepts at most 40 messages a second per player and 16 KB per message. The seat token goes in the first message, never in the URL.

## Local development

```bash
npm install --include=dev --legacy-peer-deps
npm run build            # all packages, the API and the portal
npm test                 # engine, games, API (on PGlite) and SDK↔API tests — offline
npm run playground       # http://localhost:5199 — the real game screens in a browser
npm run test:ui          # with the playground running: plays every game with clicks/drags/taps
```

Playground URLs:

- `?view=memory|quiz|sudoku|wordsearch|wordrush` shows one game.
- `?view=launcher&game=game_memory_001` runs the full launcher against a mock server that replays moves with the real engine.
- `?view=battle` shows every player of a real battle side by side. It needs the dev battle server (`npm run battle-server`: the real API on in-memory Postgres). Add `&game=<gameId>` and `&players=3` to change the game or the number of players. `npm run test:battle` plays a two-player battle with clicks.
- Add `&sdk=web` for the web SDK and `&theme=light` for the light theme.

The React Native views run in the playground through react-native-web, so you can check a layout change without a phone.

## Upgrading from 1.x

- Replace `<Game>` and the old `<GameLauncher sessionToken>` with `<GameLauncher getSession={…}>`.
- Pass `games={allGames}` to the provider. The game packages are bundled, so you no longer install them separately.
- Stop sending a host secret from the app. Create sessions on your backend.
- The old hooks `useGameSession`, `useGameState` and `useGameResult` and the old `GameModule` contract are gone.
