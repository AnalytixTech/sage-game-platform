import { useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { AnyGameRules, CompletionResult, Game, GameCategory, Leaderboard, MatchStanding, SessionCredentials } from '@sagegames/types';
import {
  GameRuntime,
  LauncherEvent,
  LauncherState,
  LeaderboardQuery,
  MatchController,
  MatchSeat,
  PlayableRuntime,
  RuntimeSnapshot,
  SessionController,
  WebSocketLike,
} from '@sagegames/core';
import { useSage } from '../provider';
import { EndReason, initialReview, launcherView, reviewReducer } from '../review';

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

/** Subscribe to a game runtime's state (local play, or a battle's server view). */
export function useRuntimeSnapshot<S = unknown>(runtime: PlayableRuntime<S>): RuntimeSnapshot<S> {
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
  /** Keep the finished board on screen with a Continue button before the result (default true). */
  reviewBeforeResult?: boolean;
}

/** How a finished local game ended (from its action log). */
function endReasonOf(runtime: LauncherState['runtime']): EndReason {
  try {
    const reason = runtime?.getLog().reason;
    if (reason === 'completed' || reason === 'quit' || reason === 'timeout') return reason;
  } catch {
    // fall through
  }
  return runtime?.getSnapshot().over ? 'completed' : 'timeout';
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

  // The review only changes what is shown: submission starts exactly as before.
  const reviewEnabled = options.reviewBeforeResult !== false;
  const [review, sendReview] = useReducer(reviewReducer, initialReview);
  useEffect(() => {
    if (state.phase === 'loading' || state.phase === 'ready' || state.phase === 'playing') sendReview({ type: 'reset' });
    else if (state.runtime?.getSnapshot().ended) sendReview({ type: 'ended', reason: endReasonOf(state.runtime) });
  }, [state.phase, state.runtime]);

  return {
    state,
    /** What to show: the launcher phase, or 'review' while the finished board is on screen. */
    view: launcherView(state.phase, review, reviewEnabled),
    review: {
      reason: review.reason,
      /** The score is still being verified. */
      verifying: state.phase === 'submitting',
      /** Move on from the review to "Checking your score…" or the result. */
      continue: () => sendReview({ type: 'continue' }),
    },
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

export interface UseMatchOptions {
  /** Your seat (from your backend)… */
  seat?: MatchSeat;
  /** …or a function that asks your backend for it. */
  getSeat?: () => Promise<MatchSeat>;
  onFinished?: (standings: MatchStanding[]) => void;
  /** Custom WebSocket factory (defaults to the global WebSocket). */
  createSocket?: (url: string) => WebSocketLike;
  /** Keep your finished board on screen with a Continue button before waiting/standings (default true). */
  reviewBeforeResult?: boolean;
}

/** Drives one online battle: lobby → countdown → race → standings. */
export function useMatch(options: UseMatchOptions) {
  const { client, plugins } = useSage();
  const callbacks = useRef(options);
  callbacks.current = options;
  const seatKey = options.seat ? `${options.seat.matchId}:${options.seat.playerToken}` : 'getSeat';

  const controller = useMemo(
    () =>
      new MatchController({
        baseUrl: client.baseUrl,
        resolveRules: (gameId) => plugins.get(gameId)?.rules,
        seat: options.seat,
        getSeat: options.getSeat ? () => callbacks.current.getSeat!() : undefined,
        createSocket: options.createSocket,
        onStandings: (s) => callbacks.current.onFinished?.(s),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, plugins, seatKey]
  );

  useEffect(() => {
    void controller.connect();
    return () => controller.dispose();
  }, [controller]);

  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useInterval(() => controller.tick(), 250, state.phase === 'playing');

  // Re-render every 100ms during the countdown so the number ticks down.
  const [, setTick] = useState(0);
  useInterval(() => setTick((n) => n + 1), 100, state.phase === 'countdown');

  const me = state.match?.players.find((p) => p.playerId === state.you) ?? null;

  // Review: your board stays up after you finish, until Continue.
  const reviewEnabled = options.reviewBeforeResult !== false;
  const [review, sendReview] = useReducer(reviewReducer, initialReview);
  const wasPlaying = useRef(false);
  const forfeited = useRef(false);
  useEffect(() => {
    if (state.phase === 'playing') {
      wasPlaying.current = true;
      forfeited.current = false;
      sendReview({ type: 'reset' });
    } else if (wasPlaying.current && (state.phase === 'waiting' || state.phase === 'finished') && state.runtime) {
      wasPlaying.current = false;
      const snap = state.runtime.getSnapshot();
      const reason: EndReason = forfeited.current || me?.status === 'forfeited' ? 'quit' : snap.over ? 'completed' : 'timeout';
      sendReview({ type: 'ended', reason });
    }
  }, [state.phase, state.runtime, me?.status]);
  const reviewing = reviewEnabled && review.stage === 'review' && (state.phase === 'waiting' || state.phase === 'finished');

  return {
    state,
    me,
    /** What to show: the match phase, or 'review' while your finished board is on screen. */
    view: reviewing ? ('review' as const) : state.phase,
    review: {
      reason: review.reason,
      /** Others are still racing (standings not in yet). */
      verifying: state.phase === 'waiting',
      continue: () => sendReview({ type: 'continue' }),
    },
    plugin: state.match ? plugins.get(state.match.gameId) : undefined,
    // A little tolerance: clock-sync jitter would otherwise show "4" at the start of a 3-second countdown.
    secondsToStart: state.startsAtLocal ? Math.max(0, Math.ceil((state.startsAtLocal - Date.now() - 250) / 1000)) : null,
    ready: () => controller.ready(),
    forfeit: () => {
      forfeited.current = true;
      controller.forfeit();
    },
    retry: () => controller.retry(),
  };
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
