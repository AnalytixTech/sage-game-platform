# @sagegames/react-native

Verified mini-games for React Native and Expo apps: Quiz Master, Memory Match, Sudoku Arena, Word Search and Word Rush, plus live battles for 2 to 16 players. The app never reports a score. It sends the player's moves, and the SageGames server replays them to compute the score.

- Core React Native only (`Animated`, `PanResponder`). No native modules and no Expo config plugin, so Expo apps install it without a rebuild.
- React Native 0.72+ and React 18/19.
- The same API as `@sagegames/react` (web).

Full documentation: `https://<api-host>/portal/docs`, also as plain Markdown at `/portal/docs/llms.txt`. The source is at [github.com/AnalytixTech/sage-game-platform](https://github.com/AnalytixTech/sage-game-platform/tree/main/docs).

## Install

```bash
npm install @sagegames/react-native
# optional: keep unsent results across restarts, and haptics
npx expo install @react-native-async-storage/async-storage expo-haptics
```

## Use

Your backend creates a session with your API key (`POST /v2/sessions`) and returns it to the app. The API key never goes into the app.

```tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { allGames, createTheme, expoHapticsFeedback, GameLauncher, SageGameProvider } from '@sagegames/react-native';

const theme = createTheme({ brand: '#7c3aed', mode: 'dark' });

export function Root() {
  return (
    <SageGameProvider
      games={allGames}
      baseUrl="https://sage-game-platform.onrender.com"
      theme={theme}
      pendingStore={AsyncStorage}
      feedback={expoHapticsFeedback(Haptics)}
    >
      <Navigation />
    </SageGameProvider>
  );
}

export function PlayScreen({ gameId, onDone }: { gameId: string; onDone: () => void }) {
  return (
    <GameLauncher
      getSession={() => myApi.post('/games/session', { gameId }).then((r) => r.data)}
      onComplete={(result) => console.log('verified', result.score, result.rank)}
      onClose={onDone}
    />
  );
}
```

`GameLauncher` runs the whole flow: intro, the game, a review of the finished board, the verified result and the chat or group leaderboard. It handles pause, quit, retries and "Play again". `MatchLauncher` runs a battle: lobby, countdown, live race and standings.

## Provider props

| Prop | |
| --- | --- |
| `games` | Usually `allGames`. Pass a subset, or replace a game's `View`. |
| `baseUrl` | The SageGames API origin. |
| `theme`, `themeOverrides` | A preset (`arcadeTheme`, `darkNavyTheme`, `lightTheme`, `minimalTheme`), `createTheme({ brand })`, or a partial theme, plus deep overrides. |
| `labels` | Reword or translate any string (`defaultLabels` lists them). |
| `feedback` | Haptics and sounds, e.g. `expoHapticsFeedback(Haptics)`. |
| `reduceMotion` | Force motion off or on. By default it follows the OS setting. |
| `components`, `slotStyles` | Replace parts (`Button`, `IntroCard`, `ResultHero`, `LeaderboardRow`, `Countdown`, `WordDefinition`) or add styles to them. |
| `pendingStore` | AsyncStorage: unsent results survive the app closing. |
| `onWordDefinition` | `({ gameId, word }) => void` when a player opens a Word Search definition. |

## GameLauncher props

`getSession` (preferred) or `session`, `onComplete`, `onError`, `onEvent`, `onClose`, `autoStart`, `showLeaderboard`, `showCountdown`, `hideChrome`, `reviewBeforeResult`, and the render overrides `renderHeader`, `renderIntro`, `renderReview`, `renderResult`, `renderSubmitting` and `renderError`. Each override receives the default element, so you can wrap it instead of rebuilding it.

## Theming and slots

```tsx
<SageGameProvider
  theme={createTheme({ brand: '#0ea5e9', mode: 'light', radius: 'round' })}
  slotStyles={{ button: { borderRadius: 999 }, review: { paddingTop: 8 } }}
  components={{ Button: MyButton, WordDefinition: MyDefinitionSheet }}
  …
/>
```

Slot style names: `button`, `card`, `chip`, `header`, `intro`, `resultHero`, `leaderboardRow`, `lobbyRow`, `countdown`, `gameBoard`, `review`, `wordDefinition`. For custom game views, the hooks (`useQuiz`, `useMemoryBoard`, `useSudoku`, `useWordSearch`, `useWordRush`) and the `ui` building blocks are exported too.

## New in 2.3

- **Review before the result.** When a game ends, the finished board stays on screen with the score, the time, a key stat and **Continue**, while the score is verified in the background. It's on by default. Use `reviewBeforeResult={false}` for the 2.2 flow, and `renderReview` to customise it. `MatchLauncher` takes both props too.
- **Word Search definitions.** Tap a found word, in the grid or in the list, to see its `definition` and `note`. Replace the popup with the `WordDefinition` slot.

See [CHANGELOG.md](https://github.com/AnalytixTech/sage-game-platform/blob/main/CHANGELOG.md) (also shipped in this package) for every release.
