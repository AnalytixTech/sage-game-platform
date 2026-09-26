# Quickstart: your first verified game in 10 minutes

By the end of this page a player can open a game in your app, play it, and see a score the SageGames server has verified.

You need a backend you control (any language; the examples use Node) and a React Native / Expo or React web app.

## 1. Create an app and a key

1. Sign in to the [developer portal](https://sage-game-platform.onrender.com/portal/) and click **New app**.
2. Pick the games your players can play.
3. On **API keys**, create a **live** key (or a **test** key while you build: its scores never reach leaderboards).
4. Copy the key. It's shown once. Put it in your backend's environment:

```bash
# .env on your server, never in the app
SAGEGAMES_API_KEY=sk_live_…
SAGEGAMES_API_URL=https://sage-game-platform.onrender.com
```

The key stays on your server. Your app only ever gets a short-lived **session token** for one game. See [API keys](KEYS_SETUP.md) for rotation and test keys.

## 2. Add a session endpoint to your backend

Your app asks your backend to start a game; your backend asks SageGames and returns only the session credentials.

```ts
// Express example
app.post('/api/games/session', requireUser, async (req, res) => {
  const r = await fetch(`${process.env.SAGEGAMES_API_URL}/v2/sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SAGEGAMES_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gameId: req.body.gameId,          // e.g. "game_memory_001"
      externalUserId: req.user.id,      // your user id
      displayName: req.user.name,       // shown on leaderboards
      contextId: req.body.contextId,    // optional: one leaderboard per chat/group, e.g. "group:42"
    }),
  });
  if (!r.ok) return res.status(502).json({ error: 'Could not start the game' });
  const { sessionId, sessionToken } = await r.json();
  res.json({ sessionId, sessionToken });
});
```

Check it with curl (a test key is fine):

```bash
curl -X POST $SAGEGAMES_API_URL/v2/sessions \
  -H "Authorization: Bearer $SAGEGAMES_API_KEY" -H "Content-Type: application/json" \
  -d '{"gameId":"game_memory_001","externalUserId":"user_1"}'
```

## 3. Install the SDK

<!-- tabs -->

```bash React Native / Expo
npm install @sagegames/react-native
```

```bash Web (React)
npm install @sagegames/react
```

<!-- /tabs -->

No native modules and no config plugin: it works in Expo Go, with React Native 0.72+ and React 18/19.

## 4. Show the game

Wrap your app once in the provider, then render a `GameLauncher` wherever a game should appear.

<!-- tabs -->

```tsx React Native / Expo
import { allGames, GameLauncher, SageGameProvider } from '@sagegames/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export function Root() {
  return (
    <SageGameProvider games={allGames} baseUrl="https://sage-game-platform.onrender.com" pendingStore={AsyncStorage}>
      <App />
    </SageGameProvider>
  );
}

export function PlayScreen({ onDone }: { onDone: () => void }) {
  return (
    <GameLauncher
      getSession={() => fetch('/api/games/session', { method: 'POST', body: JSON.stringify({ gameId: 'game_memory_001' }) }).then((r) => r.json())}
      onComplete={(result) => console.log('verified score', result.score)}
      onClose={onDone}
    />
  );
}
```

```tsx Web (React)
import { allGames, GameLauncher, SageGameProvider } from '@sagegames/react';

export function Root() {
  return (
    <SageGameProvider games={allGames} baseUrl="https://sage-game-platform.onrender.com" pendingStore={window.localStorage}>
      <GameLauncher
        getSession={() => fetch('/api/games/session', { method: 'POST', body: JSON.stringify({ gameId: 'game_memory_001' }) }).then((r) => r.json())}
        onComplete={(result) => console.log('verified score', result.score)}
      />
    </SageGameProvider>
  );
}
```

<!-- /tabs -->

Play a game to the end. The launcher sends the recorded moves, the server replays them, and the player sees their **verified** score, rank and the leaderboard. `onComplete` fires once with the server's result.

## 5. Make it yours

- Open the portal's **Design** tab to pick a preset or build a theme from your brand colour, preview every game, and copy the code. See the [design guide](DESIGN_GUIDE.md).
- Get scores pushed to your server with a [webhook](WEBHOOKS.md).
- Let players race each other in [battles](BATTLES.md).
- Use your own questions with [quiz banks](QUIZ_BANKS.md).

## What next

- [Developer guide](DEVELOPER_GUIDE.md): components, hooks, configuration and reliability.
- [Games](GAMES.md): rules, scoring and config for each game.
- [API reference](openapi.yaml): every endpoint.
- [Troubleshooting](TROUBLESHOOTING.md).
