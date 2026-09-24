import React, { useState } from 'react';
import { allGames, Game, GameCatalog, GameLauncher, lightTheme, SageGameProvider } from '@sagegames/react';

// Your backend (see examples/host-backend). It holds the API key and creates sessions.
const HOST_BACKEND = 'http://localhost:5000';

/** Ask our own backend to start a game for the signed-in user. */
async function startSession(gameId: string) {
  const res = await fetch(`${HOST_BACKEND}/api/games/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Demo-User': 'user_123' },
    body: JSON.stringify({ gameId, contextId: 'group:demo' }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? 'Could not start the game');
  return res.json() as Promise<{ sessionId: string; sessionToken: string }>;
}

export default function App() {
  const [game, setGame] = useState<Game | null>(null);

  return (
    <SageGameProvider
      games={allGames}
      baseUrl="https://sage-game-platform.onrender.com"
      theme={lightTheme}
      pendingStore={typeof window !== 'undefined' ? window.localStorage : undefined}
    >
      <main style={{ maxWidth: 520, margin: '0 auto', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
        {!game ? (
          <>
            <h1>Games</h1>
            <GameCatalog onSelectGame={setGame} />
          </>
        ) : (
          <GameLauncher
            key={game.id}
            getSession={() => startSession(game.id)}
            onComplete={(result) => console.log('Verified result', result)}
            onClose={() => setGame(null)}
          />
        )}
      </main>
    </SageGameProvider>
  );
}
