# Design guide: make SageGames look like your app

SageGames ships with a polished game look (the **arcade** theme). You can:

- pick another **preset** or build a theme from **your brand colour**;
- change any **token** (colours, gradients, shadows, radii, type, motion);
- restyle or replace individual **parts** (buttons, the intro card, the result hero…);
- write **your own game views** on top of the same game logic;
- add **haptics and sounds**.

Everything here works the same in `@sagegames/react-native` and `@sagegames/react`. The quickest way to experiment is the portal's **Design** tab (Theme Studio), which previews every game live and gives you the code to paste.

## 1. Presets

```tsx
import { SageGameProvider, allGames, arcadeTheme, darkNavyTheme, lightTheme, minimalTheme } from '@sagegames/react-native';

<SageGameProvider games={allGames} theme={darkNavyTheme}>…</SageGameProvider>
```

| Preset | Look |
| --- | --- |
| `arcadeTheme` (default) | Dark indigo, violet→magenta gradients, springy motion, confetti |
| `darkNavyTheme` | Navy and gold (the SDK 2.0 colours), with depth and motion |
| `lightTheme` | Bright and clean |
| `minimalTheme` | Flat, calm, subtle motion, no confetti. Blends into most apps |

## 2. A theme from your brand colour

```tsx
import { createTheme } from '@sagegames/react-native';

const theme = createTheme({
  brand: '#ba8109',           // your primary colour (hex)
  mode: 'dark',               // or 'light'
  accent: '#e0a526',          // optional second gradient colour
  radius: 'rounded',          // 'sharp' | 'rounded' | 'round'
  font: { regular: 'Montserrat-Regular', medium: 'Montserrat-SemiBold', bold: 'Montserrat-Bold' },
  motion: 'full',             // 'full' | 'reduced' | 'none'
});
```

`createTheme` derives backgrounds, surfaces, text, borders, board cells, gradients and shadows from the brand colour, and **guarantees WCAG AA contrast**: body text is at least 4.5:1 on every surface, and text on buttons is at least 4.5:1. If your brand colour can't carry readable button text, it's nudged lighter or darker until it can.

Define themes outside your components (or memoise them) so they aren't rebuilt on every render.

## 3. Tokens

Override any token with `themeOverrides` (a deep partial; arrays are replaced):

```tsx
<SageGameProvider
  games={allGames}
  theme={arcadeTheme}
  themeOverrides={{
    colors: { primary: '#10b981' },
    radii: { md: 8 },
    motion: { celebrations: false },
  }}
/>
```

Tokens that are derived from colours (the primary gradient, `primaryAlt`, the focus ring, raised surfaces, shadows) **follow the colours they come from**: overriding `colors.primary` above also updates `gradients.primary`, unless you override the gradient too.

| Group | Tokens |
| --- | --- |
| `colors` | `background`, `surface`, `surfaceAlt`, `surfaceRaised`, `border`, `text`, `textMuted`, `primary`, `primaryAlt`, `onPrimary`, `success`, `danger`, `warning`, `highlight`, `cellSelected`, `cellPeer`, `cellConflict`, `overlay`, `focus`, `gameAccents` (`quiz`, `memory`, `sudoku`, `wordSearch`, `wordRush`), `foundPalette` |
| `gradients` | `primary`, `surface`, `hero`: two colours each, drawn at 135° |
| `elevation` | `sm`, `md`, `lg`: `{ color, opacity, radius, offsetY, elevation }` |
| `radii` | `sm`, `md`, `lg`, `xl`, `pill` |
| `spacing` | `xs`, `sm`, `md`, `lg`, `xl` |
| `fonts` | `regular`, `medium`, `bold` (font family names; empty = system font) |
| `typography` | `display`, `title`, `heading`, `body`, `caption`, `numeric`: `{ size, weight, letterSpacing, lineHeight }` |
| `motion` | `scale` (0 = off, 1 = default, >1 slower), `spring`, `durations` (`fast`, `base`, `slow`), `celebrations` |
| `density` | `comfortable` or `compact` (touch targets never go below 44 px) |

**Gradients and shadows on React Native.** They use React Native's CSS-style `boxShadow` and `experimental_backgroundImage`, available from React Native 0.76 with the New Architecture (Expo SDK 52+). On older versions surfaces fall back to classic shadows and the first gradient colour. Nothing else changes.

A 2.1-style theme object (colours only) still works: missing tokens are filled in from its colours.

## 4. Motion and accessibility

- Flips, pops, shakes, count-ups, confetti and screen transitions all run on the native driver (React Native) or CSS transforms (web).
- The OS **reduce motion** setting is respected automatically. Force it either way with `reduceMotion`:

```tsx
<SageGameProvider reduceMotion={true} …/>   // no motion at all
<SageGameProvider reduceMotion={false} …/>  // animate even if the OS asks not to
```

- `theme.motion.scale` slows everything down or (at 0) switches it off; `theme.motion.celebrations = false` keeps motion but drops confetti.
- Motion never affects scoring: it only reacts to state the game already has.

## 5. Haptics and sounds

The SDK ships no native modules, so you pass an adapter. With Expo:

```tsx
import * as Haptics from 'expo-haptics';
import { expoHapticsFeedback } from '@sagegames/react-native';

const feedback = expoHapticsFeedback(Haptics);   // define once, outside render

<SageGameProvider feedback={feedback} …/>
```

Or write your own (for sounds too):

```ts
const feedback = {
  haptic: (kind) => { /* 'tap' | 'success' | 'warning' | 'error' | 'celebrate' */ },
  sound: (kind) => sounds[kind]?.replayAsync(),
};
```

| Kind | When |
| --- | --- |
| `tap` | A countdown second, placing a Sudoku digit |
| `success` | Pair matched, word found, correct answer |
| `warning` | Mismatched pair, a question timed out |
| `error` | Invalid word, wrong answer, wrong digit |
| `celebrate` | Row/column/box completed, game won, battle won |

On the web, `webVibrationFeedback()` uses the browser's vibration API where available.

## 6. Restyle a part (`slotStyles`)

Add styles to named parts without replacing them. Values are React Native styles in the native SDK and CSS properties on the web; they're applied after the SDK's own styles.

```tsx
<SageGameProvider
  slotStyles={{
    button: { borderRadius: 999 },
    card: { borderWidth: 0 },
    chip: { paddingHorizontal: 14 },
    header: { paddingHorizontal: 4 },
  }}
/>
```

Parts: `button`, `card`, `chip`, `header`, `intro`, `resultHero`, `leaderboardRow`, `lobbyRow`, `countdown`, `gameBoard`.

## 7. Replace a part (`components`)

Replace a piece everywhere it appears. Slot props are the same on both platforms (buttons get `onPress` on the web too).

```tsx
import type { ButtonSlotProps, LeaderboardRowSlotProps } from '@sagegames/react-native';

function BrandButton({ label, onPress, variant, disabled, loading }: ButtonSlotProps) {
  return <MyAppButton title={label} onPress={onPress} kind={variant} disabled={disabled} busy={loading} />;
}

<SageGameProvider components={{ Button: BrandButton, LeaderboardRow: MyRow }} …/>
```

| Slot | Props |
| --- | --- |
| `Button` | `label`, `onPress`, `variant` (`primary`/`secondary`/`ghost`/`danger`), `disabled`, `loading`, `compact`, `icon`, `accessibilityLabel` |
| `IntroCard` | `gameId`, `title`, `instructions`, `timed`, `onPlay` |
| `ResultHero` | `gameId`, `title`, `score`, `rank`, `durationMs`, `valid` |
| `LeaderboardRow` | `rank`, `name`, `score`, `isYou`, `index` |
| `Countdown` | `value` (seconds, or `null` for "Go!"), `kind` (`getReady` / `battle`) |

## 8. Wrap or replace whole screens

`GameLauncher` takes render overrides. Each one also receives the default element, so you can wrap it instead of rebuilding it:

```tsx
<GameLauncher
  getSession={getSession}
  renderIntro={({ plugin, play }, intro) => (
    <>
      <MyChatBanner />
      {intro}
    </>
  )}
  renderResult={({ result, playAgain }, defaultResult) => (result.valid ? defaultResult : <MyNotRankedScreen onRetry={playAgain} />)}
  renderSubmitting={({ attempt }, spinner) => spinner}
  renderError={({ message, retry }) => <MyError message={message} onRetry={retry} />}
  renderHeader={({ title, score, elapsedMs }) => <MyHeader title={title} score={score} />}
/>
```

`hideChrome` hides the top bar entirely, and `showCountdown={false}` skips the 3-2-1 before timed games.

## 9. Your own game view

Every game's logic (selection, timers, scoring feedback) lives in headless hooks, so a custom view only draws. Swap the view in the plugin list:

```tsx
import { allGames, GameViewProps, memoryEvents, ui, useGameEvents, useMemoryBoard } from '@sagegames/react-native';
import type { MemoryMatchState } from '@sagegames/game-memory-match';
import { Pressable, Text, View } from 'react-native';

function MyMemoryView({ state, dispatch, elapsedMs, theme, paused, ended }: GameViewProps<MemoryMatchState>) {
  const board = useMemoryBoard(state, elapsedMs, dispatch);   // flips, mismatch timing
  const { events, seq } = useGameEvents(state, memoryEvents);  // 'match' | 'miss' | 'complete' (+ haptics)
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {state.cards.map((card, i) => (
        <ui.Pop key={i} trigger={events.some((e) => e.kind === 'match' && e.cells.includes(i)) ? seq : null}>
          <Pressable disabled={paused || ended} onPress={() => board.flip(i)} style={{ width: 72, height: 88, borderRadius: 12, backgroundColor: theme.colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 36 }}>{board.isFaceUp(i) ? card.face : '?'}</Text>
          </Pressable>
        </ui.Pop>
      ))}
    </View>
  );
}

const games = allGames.map((g) => (g.rules.gameId === 'game_memory_001' ? { ...g, View: MyMemoryView } : g));
<SageGameProvider games={games} …/>
```

- The hooks are `useQuiz`, `useMemoryBoard`, `useSudoku`, `useWordSearch` and `useWordRush`.
- The event detectors are `quizEvents`, `memoryEvents`, `sudokuEvents`, `wordSearchEvents` and `wordRushEvents`.
- The `ui` namespace exports the SDK's own building blocks: `Button`, `Surface`, `Chip`, `Badge`, `Avatar`, `Icon`, `ProgressBar`, `Pop`, `Shake`, `Pulse`, `FadeSlide`, `CountUp`, `FloatUp`, `Confetti`, `useMotion`, `usePressScale`, `gradientStyle`, `shadowStyle` and `typeStyle`.
- Your view is played and scored exactly like the built-in one. The server replays the same moves, so how a view looks can't change a score.

## 10. Labels

Every string is in `labels` (see `defaultLabels`), for translations or tone of voice:

```tsx
<SageGameProvider labels={{ play: 'Start', youWon: 'Champion!', getReady: 'Ready?' }} …/>
```
