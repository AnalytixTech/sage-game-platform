/**
 * Visual playground for the React Native SDK (rendered with react-native-web).
 *
 *   ?view=memory|quiz|sudoku|wordsearch|wordrush   a game on its own (local play)
 *   ?view=launcher&game=<gameId>                   the full launcher against a mock server
 *   &theme=dark|light
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { View } from 'react-native';
import { replay } from '@sagegames/engine';
import { CompletionResult, PlayInfo } from '@sagegames/types';
import {
  allGames,
  darkNavyTheme,
  GameLauncher,
  GamePreview,
  lightTheme,
  memoryMatch,
  quizMaster,
  SageGameProvider,
  sudoku,
  wordRush,
  wordSearch,
} from '@sagegames/react-native';
import * as Web from '@sagegames/react';

const params = new URLSearchParams(window.location.search);
const theme = params.get('theme') === 'light' ? lightTheme : darkNavyTheme;
const view = params.get('view') ?? 'memory';
/** sdk=web renders @sagegames/react (DOM) instead of @sagegames/react-native. */
const web = params.get('sdk') === 'web';

const previews = { memory: memoryMatch, quiz: quizMaster, sudoku, wordsearch: wordSearch, wordrush: wordRush };

const JAPABUDZ_WORDS = {
  categoryName: 'Custom Terms',
  wordSelectionMode: 'combine',
  words: [
    { token: 'PASSPORT', display: 'Passport' },
    { token: 'VISA', display: 'Visa' },
    { token: 'IMMIGRATION', display: 'Immigration' },
    { token: 'CAMPUS', display: 'Campus' },
    { token: 'SCHOLARSHIP', display: 'Scholarship' },
  ],
  gridSize: 10,
  difficulty: 'medium',
};

const configFor = (gameId: string) =>
  gameId === 'game_word_search_001' ? JAPABUDZ_WORDS : gameId === 'game_sudoku_001' ? { variant: '6x6' } : {};

/** Stand-in for the platform API: /complete replays the log with the real engine, like the server. */
function mockFetch(gameId: string): typeof fetch {
  const plugin = allGames.find((g) => g.rules.gameId === gameId)!;
  const config = plugin.rules.parseConfig(configFor(gameId));
  let lastScore = 0;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  return async (input, init) => {
    const url = String(input);
    if (url.endsWith('/play') || url.endsWith('/start')) {
      const play: PlayInfo = {
        sessionId: 'sess_demo',
        gameId,
        rulesVersion: plugin.rules.rulesVersion,
        seed: 'playground',
        config: config as Record<string, unknown>,
        status: 'active',
        displayName: 'Ada',
        contextId: 'group:1',
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        startedAt: null,
        serverNow: new Date().toISOString(),
      };
      return json(play);
    }
    if (url.endsWith('/complete')) {
      await new Promise((r) => setTimeout(r, 600));
      const { log } = JSON.parse(String(init?.body));
      const outcome = replay(plugin.rules, { seed: 'playground', config, log });
      lastScore = outcome.score;
      const result: CompletionResult = {
        sessionId: 'sess_demo',
        gameId,
        status: 'verified',
        valid: outcome.flags.length === 0,
        score: outcome.score,
        durationMs: outcome.activeMs,
        result: outcome.result as Record<string, unknown>,
        flags: outcome.flags,
        rejectCode: null,
        rank: 2,
        completedAt: new Date().toISOString(),
      };
      return json(result);
    }
    if (url.includes('/leaderboard')) {
      const entry = (rank: number, name: string, score: number) => ({ rank, externalUserId: name, username: name, score, achievedAt: '', gameId });
      return json({
        gameId,
        period: 'all_time',
        totalPlayers: 4,
        entries: [entry(1, 'Amara', Math.max(1450, lastScore + 1)), entry(2, 'Ada (you)', lastScore), entry(3, 'Bayo', 610), entry(4, 'Chidi', 480)],
      });
    }
    return json({ error: 'not found' }, 404);
  };
}

function WebApp() {
  const plugins = { memory: Web.memoryMatch, quiz: Web.quizMaster, sudoku: Web.sudoku, wordsearch: Web.wordSearch, wordrush: Web.wordRush };
  if (view === 'launcher') {
    const gameId = params.get('game') ?? 'game_memory_001';
    return (
      <Web.SageGameProvider games={Web.allGames} theme={theme} baseUrl="https://mock" fetch={mockFetch(gameId)}>
        <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: theme.colors.background }}>
          <Web.GameLauncher getSession={async () => ({ sessionId: 'sess_demo', sessionToken: 'stk_demo' })} onClose={() => undefined} />
        </div>
      </Web.SageGameProvider>
    );
  }
  const plugin = plugins[view as keyof typeof plugins] ?? Web.memoryMatch;
  const config = view === 'wordsearch' ? JAPABUDZ_WORDS : view === 'sudoku' ? { variant: params.get('variant') ?? '9x9' } : {};
  return (
    <Web.SageGameProvider games={Web.allGames} theme={theme}>
      <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: theme.colors.background }}>
        <Web.GamePreview plugin={plugin} seed={params.get('seed') ?? 'playground'} config={config} />
      </div>
    </Web.SageGameProvider>
  );
}

function App() {
  if (web) return <WebApp />;
  if (view === 'launcher') {
    const gameId = params.get('game') ?? 'game_memory_001';
    return (
      <SageGameProvider games={allGames} theme={theme} baseUrl="https://mock" fetch={mockFetch(gameId)}>
        <View style={{ height: '100%' as unknown as number }}>
          <GameLauncher
            getSession={async () => ({ sessionId: 'sess_demo', sessionToken: 'stk_demo' })}
            onClose={() => undefined}
          />
        </View>
      </SageGameProvider>
    );
  }
  const plugin = previews[view as keyof typeof previews] ?? memoryMatch;
  const config = view === 'wordsearch' ? JAPABUDZ_WORDS : view === 'sudoku' ? { variant: params.get('variant') ?? '9x9' } : {};
  return (
    <SageGameProvider games={allGames} theme={theme}>
      <View style={{ minHeight: '100%' as unknown as number, backgroundColor: theme.colors.background }}>
        <GamePreview plugin={plugin} seed={params.get('seed') ?? 'playground'} config={config} />
      </View>
    </SageGameProvider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
