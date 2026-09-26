// Shared provider, hooks, theme and types
export * from '@sagegames/react-headless';
export { SageGameClient, SageApiError } from '@sagegames/core';
export type { LauncherEvent, LauncherState, MatchSeat, MatchState, PendingStore } from '@sagegames/core';
export type { CompletionResult, SessionCredentials, Leaderboard, Game, MatchStanding, MatchView } from '@sagegames/types';

// React Native UI
export * from './GameLauncher';
export * from './MatchLauncher';
export * from './GamePreview';
export * from './GameCatalog';
export { LeaderboardList, ResultView } from './ui/ResultView';
export * from './games';

// Building blocks for custom game views and slots: <ui.Button/>, <ui.Surface/>, ui.useMotion()…
export * as ui from './ui/primitives';
