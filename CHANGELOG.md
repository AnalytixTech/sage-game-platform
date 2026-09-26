# Changelog

All public packages share one version.

## 2.2.0

**Design and UX**

- New default look, the **arcade** theme: depth, gradients, springy motion and celebrations. `darkNavyTheme` and `lightTheme` keep their colours with the new depth; `minimalTheme` is flat and calm. **Visible change:** apps that didn't pass `theme` now get the arcade look; pass `theme={darkNavyTheme}` to keep the 2.x navy look.
- `createTheme({ brand })` builds a complete theme from one colour with WCAG AA contrast guaranteed.
- New theme tokens: elevation, gradients, typography, motion, density, game accents, found-word palette. Themes are deep-merged; tokens derived from colours follow them. 2.1-style themes keep working.
- Every game redesigned with motion: 3D card flips, pops and shakes, word capsules, a Word Rush path line, Sudoku row/column/box sweeps, floating points, confetti. The OS "reduce motion" setting is respected.
- Launcher: intro hero, 3-2-1 before timed games, animated header, pause and quit sheets, a new results screen with count-up, rank chips, medals and confetti. Battles: avatars, a live standings strip and a podium.
- Haptics and sounds through a `feedback` adapter (`expoHapticsFeedback`, `webVibrationFeedback`).
- Developer control: `slotStyles`, slot `components` (Button, IntroCard, ResultHero, LeaderboardRow, Countdown), `renderIntro`/`renderResult`/`renderSubmitting`/`renderError`, `useGameEvents`, and the `ui` building blocks for custom views.

**Developer portal**

- Redesigned portal with a sidebar, an app overview (setup checklist, usage sparklines, recent results), toasts and modals, and dark/light themes.
- **Theme Studio** (Design): preview every game live with any preset or brand colour, and copy the code.
- **Documentation** built into the portal, with search, an API reference and code you can copy.

## 2.1.0

- **Battles**: 2 to 16 players race the same puzzle live over WebSockets; the server applies every move. `MatchLauncher`, `useMatch`, `match.finished` webhooks.
- Hidden information in battles: Memory card faces and Quiz answers stay on the server until revealed.
- Quiz banks in the portal (paste from a spreadsheet).
- Structured logs with secret redaction, request ids, and optional Sentry reporting.

## 2.0.0

- Scores are computed by the server from a replay of the player's moves (no more client-reported scores).
- Playable React Native and web SDKs for all five games; `GameLauncher` with retries and a pending-result store.
- Postgres-backed v2 API, developer portal with self-service API keys, per-context leaderboards, signed webhooks.
