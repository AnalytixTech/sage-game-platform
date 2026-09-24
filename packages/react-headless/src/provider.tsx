import React, { createContext, ReactNode, useContext, useMemo } from 'react';
import { PendingStore, SageGameClient } from '@sagegames/core';
import { defaultLabels, SageLabels } from './labels';
import { GamePlugin } from './plugin';
import { lightTheme, mergeTheme, PartialTheme, SageTheme } from './theme';

export interface SageContextValue {
  client: SageGameClient;
  plugins: Map<string, GamePlugin>;
  theme: SageTheme;
  labels: SageLabels;
  pendingStore?: PendingStore;
}

const SageContext = createContext<SageContextValue | null>(null);

export interface SageGameProviderProps {
  children: ReactNode;
  /** Games this app can render (the UI packages export `allGames`). */
  games: GamePlugin[];
  /** SageGames API origin. */
  baseUrl?: string;
  /** Base theme (e.g. darkNavyTheme), plus optional overrides. */
  theme?: SageTheme;
  themeOverrides?: PartialTheme;
  labels?: Partial<SageLabels>;
  /** Keeps unsent results across app restarts (AsyncStorage, localStorage…). */
  pendingStore?: PendingStore;
  fetch?: typeof fetch;
}

export function SageGameProvider({
  children,
  games,
  baseUrl,
  theme = lightTheme,
  themeOverrides,
  labels,
  pendingStore,
  fetch: fetchImpl,
}: SageGameProviderProps) {
  const client = useMemo(() => new SageGameClient({ baseUrl, fetch: fetchImpl }), [baseUrl, fetchImpl]);
  // Keyed on the game ids, so an inline `games={[...]}` array doesn't rebuild the map every render.
  const gameKey = games.map((g) => `${g.rules.gameId}@${g.rules.rulesVersion}`).join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plugins = useMemo(() => new Map(games.map((g) => [g.rules.gameId, g])), [gameKey]);
  const themeKey = JSON.stringify(themeOverrides ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mergedTheme = useMemo(() => mergeTheme(theme, themeOverrides), [theme, themeKey]);
  const labelsKey = JSON.stringify(labels ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mergedLabels = useMemo(() => ({ ...defaultLabels, ...labels }), [labelsKey]);

  const value = useMemo<SageContextValue>(
    () => ({ client, plugins, theme: mergedTheme, labels: mergedLabels, pendingStore }),
    [client, plugins, mergedTheme, mergedLabels, pendingStore]
  );
  return <SageContext.Provider value={value}>{children}</SageContext.Provider>;
}

export function useSage(): SageContextValue {
  const ctx = useContext(SageContext);
  if (!ctx) throw new Error('SageGames components must be inside <SageGameProvider>');
  return ctx;
}
