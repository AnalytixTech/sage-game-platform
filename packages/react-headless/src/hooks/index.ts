import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AnyGameRules, CompletionResult, Game, GameCategory, Leaderboard, SessionCredentials } from '@sagegames/types';
import { GameRuntime, LauncherEvent, LauncherState, LeaderboardQuery, RuntimeSnapshot, SessionController } from '@sagegames/core';
import { useSage } from '../provider';

/** Run `fn` every `ms` while `active`. */
export function useInterval(fn: () => void, ms: number, active: boolean) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => ref.current(), ms);
    return () => clearInterval(id);
  }, [ms, active]);
}

/** Subscribe to a game runtime's state. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useRuntimeSnapshot<S = unknown>(runtime: GameRuntime<any, S, any, any>): RuntimeSnapshot<S> {
  return useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
}

export interface UseLauncherOptions {
  /** Session credentials from your backend… */
  session?: SessionCredentials;
  /** …or a function that asks your backend for one (enables "Play again"). */
  getSession?: () => Promise<SessionCredentials>;
  /** Called once with the server-verified result. */
  onComplete?: (result: CompletionResult) => void;
  onError?: (error: NonNullable<LauncherState['error']>) => void;
  onEvent?: (event: LauncherEvent) => void;
  /** Start as soon as the game is loaded instead of showing the intro card. */
  autoStart?: boolean;
}

/** Drives one game from session to verified result. */
export function useLauncher(options: UseLauncherOptions) {
  const { client, plugins, pendingStore } = useSage();
  const callbacks = useRef(options);
  callbacks.current = options;

  const sessionKey = options.session ? options.session.sessionId : 'getSession';

  const controller = useMemo(
    () =>
      new SessionController({
        client,
        resolveRules: (gameId) => plugins.get(gameId)?.rules,
        session: options.session,
        getSession: options.getSession ? () => callbacks.current.getSession!() : undefined,
        pendingStore,
        onEvent: (event) => {
          callbacks.current.onEvent?.(event);
          if (event.type === 'completed') callbacks.current.onComplete?.(event.result);
          if (event.type === 'error') callbacks.current.onError?.(event.error);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, plugins, pendingStore, sessionKey]
  );

  useEffect(() => {
    void controller.load();
    return () => controller.dispose();
  }, [controller]);

  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);

  useEffect(() => {
    if (options.autoStart && state.phase === 'ready') void controller.begin();
  }, [options.autoStart, state.phase, controller]);

  // Drive timers (question timeouts, countdowns) while playing.
  useInterval(() => controller.tick(), 250, state.phase === 'playing');

  return {
    state,
    plugin: state.play ? plugins.get(state.play.gameId) : undefined,
    controller,
    begin: () => controller.begin(),
    retry: () => controller.retry(),
    quit: () => controller.quit(),
    pause: () => controller.pause(),
    resume: () => controller.resume(),
    playAgain: () => controller.playAgain(),
    canPlayAgain: controller.canPlayAgain,
  };
}

/** Leaderboard for a session's chat/group (scope 'context', default) or the whole app ('game'). */
export function useLeaderboard(session: SessionCredentials | null, query: LeaderboardQuery = {}, refreshKey?: unknown) {
  const { client } = useSage();
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);
  const q = JSON.stringify(query);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setLoading(true);
    client
      .forSession(session.sessionToken)
      .leaderboard(session.sessionId, JSON.parse(q))
      .then((b) => {
        if (!cancelled) {
          setBoard(b);
          setError(null);
        }
      })
      .catch((e: Error) => !cancelled && setError(e))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [client, session?.sessionId, session?.sessionToken, q, refreshKey]);

  return { board, error, loading };
}

/** Public game catalog, limited to games this app can render. */
export function useGames(filter: { category?: GameCategory } = {}) {
  const { client, plugins } = useSage();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    client.games
      .list({ category: filter.category })
      .then((list) => {
        if (!cancelled) {
          setGames(list.filter((g) => plugins.has(g.id)));
          setError(null);
        }
      })
      .catch((e: Error) => !cancelled && setError(e))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [client, plugins, filter.category]);

  return { games, loading, error };
}

/**
 * Play a game locally without a session (previews, tutorials, design work).
 * Scores are not submitted or verified.
 */
export function useLocalGame(rules: AnyGameRules, seed: string, config: unknown = {}) {
  const configKey = JSON.stringify(config ?? {});
  const runtime = useMemo(
    () => new GameRuntime({ rules, seed, config: rules.parseConfig(config) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rules, seed, configKey]
  );
  useEffect(() => runtime.start(), [runtime]);
  const snapshot = useRuntimeSnapshot(runtime);
  useInterval(() => runtime.tick(), 250, !snapshot.ended);
  return { runtime, snapshot };
}
