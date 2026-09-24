import { ActionLog, AnyGameRules, CompletionResult, PlayInfo, SessionCredentials } from '@sagegames/types';
import { SageApiError, SageGameClient, SessionClient } from '../api/client';
import { GameRuntime } from '../runtime/GameRuntime';

export type LauncherPhase = 'loading' | 'ready' | 'playing' | 'submitting' | 'result' | 'error';

export interface LauncherError {
  message: string;
  code?: string;
  /** Whether retry() can reasonably succeed (network trouble, server errors). */
  retryable: boolean;
  during: 'load' | 'start' | 'submit';
}

export interface LauncherState {
  phase: LauncherPhase;
  /** Credentials of the current session (for leaderboard calls). */
  session: SessionCredentials | null;
  play: PlayInfo | null;
  rules: AnyGameRules | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runtime: GameRuntime<any, any, any, any> | null;
  result: CompletionResult | null;
  error: LauncherError | null;
  /** Submission attempt in progress (1-based), for "Retrying…" messages. */
  attempt: number;
}

export type LauncherEvent =
  | { type: 'loaded'; play: PlayInfo }
  | { type: 'started'; sessionId: string; gameId: string }
  | { type: 'paused' }
  | { type: 'resumed' }
  | { type: 'ended'; reason: ActionLog['reason']; clientScore: number }
  | { type: 'completed'; result: CompletionResult }
  | { type: 'error'; error: LauncherError };

/**
 * Persists an unsent result so it survives the app being closed while offline.
 * Compatible with React Native AsyncStorage and window.localStorage.
 */
export interface PendingStore {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
}

export interface SessionControllerOptions {
  client: SageGameClient;
  /** Rules for the games this app can render. */
  resolveRules: (gameId: string) => AnyGameRules | undefined;
  /** Credentials already obtained from the host backend… */
  session?: SessionCredentials;
  /** …or a function that asks the host backend for a new session (enables playAgain). */
  getSession?: () => Promise<SessionCredentials>;
  pendingStore?: PendingStore;
  onEvent?: (event: LauncherEvent) => void;
  now?: () => number;
  /** Delays between submission attempts. */
  retryDelaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
}

const PENDING_PREFIX = 'sagegames:pending:';
const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function toLauncherError(err: unknown, during: LauncherError['during']): LauncherError {
  if (err instanceof SageApiError) {
    return { message: err.message, code: err.code, retryable: err.retryable, during };
  }
  return { message: err instanceof Error ? err.message : String(err), retryable: during !== 'start', during };
}

/**
 * Drives one game from session to verified result, independent of any UI framework:
 * loading → ready → playing → submitting → result (or error, with retry()).
 * React bindings subscribe via subscribe/getSnapshot.
 */
export class SessionController {
  private state: LauncherState = {
    phase: 'loading',
    session: null,
    play: null,
    rules: null,
    runtime: null,
    result: null,
    error: null,
    attempt: 0,
  };
  private readonly listeners = new Set<() => void>();
  private credentials: SessionCredentials | null = null;
  private api: SessionClient | null = null;
  private pendingLog: ActionLog | null = null;
  private unsubscribeRuntime: (() => void) | null = null;
  private disposed = false;
  private loadStarted = false;

  constructor(private readonly options: SessionControllerOptions) {
    if (!options.session && !options.getSession) {
      throw new Error('SessionController needs either `session` or `getSession`');
    }
  }

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  public getSnapshot = (): LauncherState => this.state;

  /** Fetch the session and prepare the game. Safe to call once; later calls are ignored. */
  public async load(): Promise<void> {
    if (this.loadStarted && this.state.phase !== 'error') return;
    this.loadStarted = true;
    this.set({ phase: 'loading', error: null });

    try {
      if (!this.credentials) {
        this.credentials = this.options.session ?? (await this.options.getSession!());
      }
      const creds = this.credentials;
      this.set({ session: creds });
      this.api = this.options.client.forSession(creds.sessionToken);
      const play = await this.api.play(creds.sessionId);
      if (this.disposed) return;

      const rules = this.options.resolveRules(play.gameId);
      if (!rules) {
        return this.fail({ message: `This app cannot render game ${play.gameId}`, code: 'game_not_supported', retryable: false, during: 'load' });
      }
      if (rules.rulesVersion !== play.rulesVersion) {
        return this.fail({
          message: 'This game has been updated. Please update the app to play it.',
          code: 'sdk_update_required',
          retryable: false,
          during: 'load',
        });
      }

      // A result that never reached the server (app closed while offline) is sent first.
      const pending = await this.readPending(creds.sessionId);
      this.set({ play, rules });
      this.emit({ type: 'loaded', play });
      if (pending) {
        this.pendingLog = pending;
        return this.submit();
      }

      if (play.status === 'completed') {
        return this.fail({ message: 'This game has already been played.', code: 'already_completed', retryable: false, during: 'load' });
      }
      if (play.status === 'expired' || new Date(play.expiresAt).getTime() <= Date.parse(play.serverNow)) {
        return this.fail({ message: 'This game session has expired.', code: 'session_expired', retryable: false, during: 'load' });
      }
      this.set({ phase: 'ready' });
    } catch (err) {
      this.fail(toLauncherError(err, 'load'));
    }
  }

  /** Start playing (the player pressed Play). */
  public async begin(): Promise<void> {
    const { play, rules } = this.state;
    if (!play || !rules || !this.api || (this.state.phase !== 'ready' && this.state.error?.during !== 'start')) return;

    try {
      await this.api.start(play.sessionId, rules.rulesVersion);
    } catch (err) {
      return this.fail(toLauncherError(err, 'start'));
    }
    if (this.disposed) return;

    const runtime = new GameRuntime({ rules, seed: play.seed, config: play.config, now: this.options.now });
    this.unsubscribeRuntime = runtime.subscribe(() => {
      const snap = runtime.getSnapshot();
      if (snap.ended && this.state.phase === 'playing') {
        const log = runtime.getLog();
        this.emit({ type: 'ended', reason: log.reason, clientScore: snap.score });
        this.pendingLog = log;
        void this.submit();
      }
    });
    runtime.start();
    this.set({ phase: 'playing', runtime, error: null });
    this.emit({ type: 'started', sessionId: play.sessionId, gameId: play.gameId });
  }

  public tick(): void {
    if (this.state.phase === 'playing') this.state.runtime?.tick();
  }

  public pause(): void {
    if (this.state.phase === 'playing' && this.state.runtime?.pause()) this.emit({ type: 'paused' });
  }

  public resume(): void {
    if (this.state.phase === 'playing' && this.state.runtime?.resume()) this.emit({ type: 'resumed' });
  }

  /** Give up the current game; the partial result is still submitted and verified. */
  public quit(): void {
    if (this.state.phase === 'playing') this.state.runtime?.finish('quit');
  }

  public async retry(): Promise<void> {
    const during = this.state.error?.during;
    if (!this.state.error?.retryable) return;
    if (during === 'load') return this.load();
    if (during === 'start') return this.begin();
    if (during === 'submit') return this.submit();
  }

  /** Whether playAgain() can fetch a fresh session from the host. */
  public get canPlayAgain(): boolean {
    return !!this.options.getSession;
  }

  /** Ask the host for a new session and load it (needs getSession). */
  public async playAgain(): Promise<void> {
    if (!this.options.getSession) return;
    this.teardownRuntime();
    this.credentials = null;
    this.api = null;
    this.pendingLog = null;
    this.loadStarted = false;
    this.set({ phase: 'loading', session: null, play: null, rules: null, runtime: null, result: null, error: null, attempt: 0 });
    return this.load();
  }

  public dispose(): void {
    this.disposed = true;
    this.teardownRuntime();
    this.listeners.clear();
  }

  private async submit(): Promise<void> {
    const log = this.pendingLog;
    const play = this.state.play;
    if (!log || !play || !this.api) return;

    this.set({ phase: 'submitting', error: null, attempt: 0 });
    await this.writePending(play.sessionId, log);

    const delays = this.options.retryDelaysMs ?? [1000, 3000, 9000];
    const sleep = this.options.sleep ?? defaultSleep;
    for (let attempt = 0; attempt <= delays.length; attempt++) {
      if (this.disposed) return;
      this.set({ attempt: attempt + 1 });
      try {
        const result = await this.api.complete(play.sessionId, log);
        await this.clearPending(play.sessionId);
        this.pendingLog = null;
        this.set({ phase: 'result', result });
        this.emit({ type: 'completed', result });
        return;
      } catch (err) {
        const error = toLauncherError(err, 'submit');
        if (!error.retryable || attempt === delays.length) {
          // A permanent failure means the server will never accept this log; don't keep it.
          if (!error.retryable) await this.clearPending(play.sessionId);
          return this.fail(error);
        }
        await sleep(delays[attempt]);
      }
    }
  }

  private fail(error: LauncherError): void {
    if (this.disposed) return;
    this.set({ phase: 'error', error });
    this.emit({ type: 'error', error });
  }

  private set(patch: Partial<LauncherState>): void {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  private emit(event: LauncherEvent): void {
    try {
      this.options.onEvent?.(event);
    } catch {
      // Host callbacks must never break the game.
    }
  }

  private teardownRuntime(): void {
    this.unsubscribeRuntime?.();
    this.unsubscribeRuntime = null;
  }

  private async readPending(sessionId: string): Promise<ActionLog | null> {
    try {
      const raw = await this.options.pendingStore?.getItem(PENDING_PREFIX + sessionId);
      return raw ? (JSON.parse(raw) as ActionLog) : null;
    } catch {
      return null;
    }
  }

  private async writePending(sessionId: string, log: ActionLog): Promise<void> {
    try {
      await this.options.pendingStore?.setItem(PENDING_PREFIX + sessionId, JSON.stringify(log));
    } catch {
      // Storage is best-effort.
    }
  }

  private async clearPending(sessionId: string): Promise<void> {
    try {
      await this.options.pendingStore?.removeItem(PENDING_PREFIX + sessionId);
    } catch {
      // ignore
    }
  }
}
