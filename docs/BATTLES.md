# Online battles

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

## How a battle is decided

| Game | Winner |
| --- | --- |
| Sudoku, Word Search, Memory Match | First to solve the puzzle. Players who haven't solved it when the time runs out rank below everyone who did, ordered by score, then progress. |
| Quiz Master, Word Rush | Highest score. The faster time breaks ties. |

A player who leaves, or stays disconnected for more than **30 seconds**, forfeits and ranks last. Every player's result is also stored as a normal verified result, so it counts on leaderboards and in player stats.

## 1. Create the match on your backend

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

## 2. Give each player their seat

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

## 3. Show the battle in the app

```tsx
import { MatchLauncher } from '@sagegames/react-native'; // or '@sagegames/react'

<MatchLauncher
  getSeat={() => api.post(`/api/battles/${matchId}/seat`).then((r) => r.data)}
  onFinished={(standings) => console.log('winner', standings[0].displayName)}
  onClose={close}
/>
```

`MatchLauncher` handles the lobby (with a "ready" button), the countdown, the game with a live progress bar for each player, a "waiting for the others" screen once you finish, and the final standings. If the connection drops, it reconnects and carries on from the last move the server has. For your own UI, `useMatch({ getSeat })` returns the same state (`phase`, `match`, `runtime`, `standings`) with `ready()`, `forfeit()` and `retry()`.

## Match API (API key)

| Endpoint | Purpose |
| --- | --- |
| `POST /v2/matches` | Create a match (above). Returns the match view. |
| `GET /v2/matches/:id` | Status, players (connected, progress, score) and final `standings`. |
| `POST /v2/matches/:id/tokens` | `{ externalUserId }` → a seat token for a seated player. |
| `POST /v2/matches/:id/players` | `{ externalUserId, displayName? }` → take a seat in an open lobby, then return its token. Errors: `invite_only`, `match_full`, `match_started`. |

The `match.finished` webhook carries `{ matchId, gameId, contextId, standings, finishedAt }`. Each standing has `rank`, `externalUserId`, `displayName`, `status` (`finished`, `forfeited`…), `score`, `completed` and `finishedMs`. Matches created with a test key send no webhooks.

## Limits

- Battles run on a single API instance and live in memory while they're played. A server restart **aborts** any battle in progress (status `aborted`); lobbies survive.
- On Render, use a paid plan: a sleeping free instance drops every open connection.
- The WebSocket accepts at most 40 messages a second per player and 16 KB per message. The seat token goes in the first message, never in the URL.

## Hidden information

In Memory Match and Quiz Master battles the app never holds the answers. There's no seed or config on the device: the server plays the game and sends each player only what they're allowed to see (the cards they've turned over, a question's answer once they've answered it). A modified app can't peek at card faces or quiz answers, including answers from your own quiz banks. Flips and answers appear after one round trip to the server, usually well under a tenth of a second. `MatchLauncher` and `useMatch` handle this for you; nothing changes in your integration.

Solo games still run on the device (with the server replaying every move), so a solo quiz's answers are on the phone. Use battles when the stakes are high.
