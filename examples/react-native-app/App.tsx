import React, { useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StatusBar, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { allGames, darkNavyTheme, Game, GameCatalog, GameLauncher, SageGameProvider } from '@sagegames/react-native';

// Your backend (see examples/host-backend). It holds the API key and creates sessions.
const HOST_BACKEND = 'https://api.your-app.com';

async function startSession(gameId: string) {
  const res = await fetch(`${HOST_BACKEND}/api/games/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer <your user token>' },
    body: JSON.stringify({ gameId }),
  });
  if (!res.ok) throw new Error('Could not start the game');
  return res.json() as Promise<{ sessionId: string; sessionToken: string }>;
}

export default function App() {
  const [game, setGame] = useState<Game | null>(null);
  const theme = darkNavyTheme;

  return (
    <SageGameProvider
      games={allGames}
      baseUrl="https://sage-game-platform.onrender.com"
      theme={theme}
      pendingStore={AsyncStorage}
    >
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
        {!game ? (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
            <Text style={{ color: theme.colors.text, fontSize: 26, fontWeight: '700' }}>Games</Text>
            <GameCatalog onSelectGame={setGame} />
          </ScrollView>
        ) : (
          <>
            <Pressable onPress={() => setGame(null)} style={{ padding: 16 }}>
              <Text style={{ color: theme.colors.textMuted }}>‹ All games</Text>
            </Pressable>
            <GameLauncher key={game.id} getSession={() => startSession(game.id)} onClose={() => setGame(null)} />
          </>
        )}
      </SafeAreaView>
    </SageGameProvider>
  );
}
