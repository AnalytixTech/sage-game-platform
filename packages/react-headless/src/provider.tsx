import React, { createContext, ReactNode, useContext, useMemo } from 'react';
import { PendingStore, SageGameClient } from '@sagegames/core';
import { FeedbackAdapter } from './feedback';
import { defaultLabels, SageLabels } from './labels';
import { GamePlugin } from './plugin';
import { arcadeTheme } from './presets';
import type { SlotComponents, SlotStyles } from './slots';
import { mergeTheme, PartialTheme, resolveTheme, SageTheme } from './theme';

export interface SageContextValue {
  client: SageGameClient;
  plugins: Map<string, GamePlugin>;
  theme: SageTheme;
  labels: SageLabels;
  pendingStore?: PendingStore;
  feedback?: FeedbackAdapter;
  /** Forced motion setting; undefined follows the OS "reduce motion" setting. */
  reduceMotion?: boolean;
  components?: Partial<SlotComponents>;
  slotStyles?: SlotStyles;
}

const SageContext = createContext<SageContextValue | null>(null);

export interface SageGameProviderProps {
  children: ReactNode;
  /** Games this app can render (the UI packages export `allGames`). */
  games: GamePlugin[];
  /** SageGames API origin. */
  baseUrl?: string;
  /**
   * Base theme: a preset (arcadeTheme — the default —, darkNavyTheme, lightTheme, minimalTheme),
   * createTheme({ brand }), or any partial theme (missing tokens are filled in).
   */
  theme?: SageTheme | PartialTheme;
  themeOverrides?: PartialTheme;
  labels?: Partial<SageLabels>;
  /** Keeps unsent results across app restarts (AsyncStorage, localStorage…). */
  pendingStore?: PendingStore;
  fetch?: typeof fetch;
  /** Haptics and sounds (e.g. expoHapticsFeedback(Haptics)). Nothing plays without one. */
  feedback?: FeedbackAdapter;
  /** true: no motion; false: always animate; undefined (default): follow the OS setting. */
  reduceMotion?: boolean;
  /** Replace pieces of the UI everywhere (Button, IntroCard, ResultHero, LeaderboardRow, Countdown). */
  components?: Partial<SlotComponents>;
  /** Extra styles for named parts (button, card, chip, header, intro, resultHero…). */
  slotStyles?: SlotStyles;
}

export function SageGameProvider({
  children,
  games,
  baseUrl,
  theme = arcadeTheme,
  themeOverrides,
  labels,
  pendingStore,
  fetch: fetchImpl,
  feedback,
  reduceMotion,
  components,
  slotStyles,
}: SageGameProviderProps) {
  const client = useMemo(() => new SageGameClient({ baseUrl, fetch: fetchImpl }), [baseUrl, fetchImpl]);
  // Keyed on the game ids, so an inline `games={[...]}` array doesn't rebuild the map every render.
  const gameKey = games.map((g) => `${g.rules.gameId}@${g.rules.rulesVersion}`).join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plugins = useMemo(() => new Map(games.map((g) => [g.rules.gameId, g])), [gameKey]);
  const themeKey = JSON.stringify(themeOverrides ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mergedTheme = useMemo(() => mergeTheme(resolveTheme(theme as PartialTheme, arcadeTheme), themeOverrides), [theme, themeKey]);
  const labelsKey = JSON.stringify(labels ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mergedLabels = useMemo(() => ({ ...defaultLabels, ...labels }), [labelsKey]);

  const value = useMemo<SageContextValue>(
    () => ({ client, plugins, theme: mergedTheme, labels: mergedLabels, pendingStore, feedback, reduceMotion, components, slotStyles }),
    [client, plugins, mergedTheme, mergedLabels, pendingStore, feedback, reduceMotion, components, slotStyles]
  );
  return <SageContext.Provider value={value}>{children}</SageContext.Provider>;
}

export function useSage(): SageContextValue {
  const ctx = useContext(SageContext);
  if (!ctx) throw new Error('SageGames components must be inside <SageGameProvider>');
  return ctx;
}
