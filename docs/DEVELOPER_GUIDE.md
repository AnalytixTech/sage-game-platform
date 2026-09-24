# SageGames developer guide (SDK 2.0)

This guide covers adding SageGames to a React Native / Expo or React web app. You get five playable games — Quiz Master, Memory Match, Sudoku Arena, Word Search and Word Rush — with scores the server verifies, leaderboards and webhooks.

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
- Add `&sdk=web` for the web SDK and `&theme=light` for the light theme.

The React Native views run in the playground through react-native-web, so you can check a layout change without a phone.

## Upgrading from 1.x

- Replace `<Game>` and the old `<GameLauncher sessionToken>` with `<GameLauncher getSession={…}>`.
- Pass `games={allGames}` to the provider. The game packages are bundled, so you no longer install them separately.
- Stop sending a host secret from the app. Create sessions on your backend.
- The old hooks `useGameSession`, `useGameState` and `useGameResult` and the old `GameModule` contract are gone.
