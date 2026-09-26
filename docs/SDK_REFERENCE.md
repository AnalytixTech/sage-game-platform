# SDK reference

`@sagegames/react-native` and `@sagegames/react` export the same API. Everything below is available from either package.

## Provider

```tsx
<SageGameProvider games={allGames} baseUrl="https://sage-game-platform.onrender.com" theme={arcadeTheme}>…</SageGameProvider>
```

| Prop | Type | |
| --- | --- | --- |
| `games` | `GamePlugin[]` | Usually `allGames`. Pass a subset to offer fewer games, or replace a game's `View`. |
| `baseUrl` | `string` | The SageGames API origin. |
| `theme` | `SageTheme \| PartialTheme` | A preset, `createTheme(...)`, or a partial theme. Default `arcadeTheme`. |
| `themeOverrides` | `PartialTheme` | Deep overrides on top of `theme`. |
| `labels` | `Partial<SageLabels>` | Rewording and translations. |
| `feedback` | `FeedbackAdapter` | Haptics and sounds, e.g. `expoHapticsFeedback(Haptics)`. |
| `reduceMotion` | `boolean` | Force motion off (`true`) or on (`false`); default follows the OS. |
| `components` | `Partial<SlotComponents>` | Replace `Button`, `IntroCard`, `ResultHero`, `LeaderboardRow`, `Countdown`, `WordDefinition`. |
| `slotStyles` | `SlotStyles` | Extra styles for named parts. |
| `pendingStore` | `PendingStore` | AsyncStorage / localStorage, keeps unsent results across restarts. |
| `fetch` | `typeof fetch` | Custom fetch (tests, proxies). |
| `onWordDefinition` | `(info: { gameId, word }) => void` | Called when a player opens a Word Search definition (analytics). |

## Components

| Component | Props |
| --- | --- |
| `GameLauncher` | `getSession` or `session`, `onComplete`, `onError`, `onEvent`, `onClose`, `autoStart`, `showLeaderboard`, `showCountdown`, `hideChrome`, `reviewBeforeResult`, `renderHeader`, `renderIntro`, `renderReview`, `renderResult`, `renderSubmitting`, `renderError`, `style` (and `className` on the web) |
| `MatchLauncher` | `seat` or `getSeat`, `onFinished`, `onClose`, `reviewBeforeResult`, `renderReview`, `style` |
| `ReviewView` | The review screen on its own: `board`, `score`, `elapsedMs`, `reason`, `stat`, `status`, `verifying`, `onContinue`, `render` |
| `WordDefinitionPopup` | The default Word Search definition popup (`WordDefinitionSlotProps`) |
| `GameCatalog` | `onSelectGame`, `category` |
| `GamePreview` | `plugin`, `seed`, `config`: plays locally, not verified (demos, tutorials) |
| `LeaderboardList` | `session`, and `highlightUserRank` (React Native) or `highlightRank` (web) |
| `ResultView` | Result screen on its own: `result`, `title`, `gameId`, `session`, `showLeaderboard`, `onPlayAgain`, `onClose` |

`GameLauncher` calls `onComplete` once, with the server's result: `sessionId`, `gameId`, `status` (`verified`/`rejected`), `valid`, `score`, `durationMs`, `rank`, `result`, `flags`.

### Review before the result (2.3)

When a game ends (completed, time up or quit) the finished board stays on screen, read-only, with the score, the time, one key stat and a **Continue** button. Verification starts at once in the background, exactly as before, and its status shows next to the button ("Checking your score…", "Connection trouble, retrying…"). Continue shows the result, or "Checking your score…" first if verification is still running. In a battle, Continue leads to the waiting screen or the standings.

`onComplete` is not delayed by the review: it fires as soon as the server answers. The review never changes the submitted moves or the end time.

`reviewBeforeResult={false}` turns it off (2.2 behaviour). `renderReview` wraps or replaces it:

```tsx
<GameLauncher
  getSession={getSession}
  renderReview={({ score, verifying, continue: next }, review) => (
    <>
      <MyShareBar score={score} />
      {review}
    </>
  )}
/>
```

`renderReview` receives `{ board, score, elapsedMs, reason: 'completed' | 'quit' | 'timeout', verifying, continue }` and the default element.

## Hooks

| Hook | Returns |
| --- | --- |
| `useSage()` | `{ theme, labels, plugins, client, feedback, … }` |
| `useLauncher(options)` | The launcher's state machine, for a fully custom launcher UI. Also returns `view` (the phase, or `'review'`) and `review { reason, verifying, continue }` |
| `useMatch({ seat \| getSeat })` | `{ state, me, plugin, view, review, secondsToStart, ready, forfeit, retry }` |
| `useLeaderboard(session, { scope, limit })` | `{ board, loading, error }` |
| `useGames({ category })` | The catalog |
| `useLocalGame(rules, seed, config)` | A local runtime and its snapshot |
| `useRuntimeSnapshot(runtime)` | Live state of a runtime |
| `useGameEvents(state, detector)` | `{ events, seq }`: matches, misses, words found, rows completed… (also plays feedback) |
| `useFeedback()` | `(kind) => void` through the provider's adapter |
| `useMotionSettings(osReduced)` | `{ reduced, celebrations, ms, spring }` |
| `useSlot(name)`, `useSlotStyle(name)` | The host's slot component / style |
| Game controllers | `useQuiz`, `useMemoryBoard`, `useSudoku`, `useWordSearch`, `useWordRush` |

Event detectors for `useGameEvents`: `quizEvents`, `memoryEvents`, `sudokuEvents`, `wordSearchEvents`, `wordRushEvents`.

`useWordSearch(state, dispatch, { readOnly })` also returns `definition` (the open one, or `null`), `showDefinition(index)`, `closeDefinition()`, `canDefine(index)` and `hasDefinitions`. The pure pieces behind the review and the tap rule are exported too: `reviewReducer`, `launcherView`, `reviewStat`, `reviewTitle`, `selectionStep`, `definedWordAt`.

## Theme

| Export | |
| --- | --- |
| `arcadeTheme`, `darkNavyTheme`, `lightTheme`, `minimalTheme`, `presets` | Presets |
| `createTheme(options)` | A full theme from a brand colour (WCAG AA) |
| `mergeTheme(theme, overrides)` | Deep merge; derived tokens follow their colours |
| `resolveTheme(partial, fallback)` | Fill the missing tokens of a partial theme |
| `gameAccent(theme, gameId)`, `gameGlyph(gameId)` | A game's accent colour and emoji |
| `contrast`, `mix`, `alpha`, `ensureContrast`, `readableOn` | Colour helpers |

See the [design guide](DESIGN_GUIDE.md) for every token.

## Feedback

| Export | |
| --- | --- |
| `FeedbackAdapter` | `{ haptic?(kind), sound?(kind) }` |
| `expoHapticsFeedback(Haptics)` | Adapter for `expo-haptics` |
| `webVibrationFeedback()` | Adapter for the browser vibration API |

Kinds: `tap`, `success`, `warning`, `error`, `celebrate`.

## UI building blocks (`ui`)

For custom game views and slots: `ui.Button`, `ui.IconButton`, `ui.Surface`, `ui.Card`, `ui.Chip`, `ui.Badge`, `ui.Avatar`, `ui.Icon`, `ui.Stat`, `ui.ProgressBar`, `ui.Loading`, `ui.Heading`, `ui.Body`, motion (`ui.Pop`, `ui.Shake`, `ui.Pulse`, `ui.FadeSlide`, `ui.CountUp`, `ui.FloatUp`, `ui.Confetti`, `ui.useMotion`, `ui.usePressScale`), and style helpers (`ui.gradientStyle`/`ui.shadowStyle`/`ui.typeStyle` on React Native, `ui.gradientCss`/`ui.shadowCss`/`ui.typeStyle` on the web).

## Game plugins

`allGames`, `quizMaster`, `memoryMatch`, `sudoku`, `wordSearch`, `wordRush`. A plugin is `{ rules, title, instructions, View }`; replace `View` to draw a game your own way (see the design guide).

## Labels

Every user-facing string is in `defaultLabels`. Override any of them with the provider's `labels` prop.
