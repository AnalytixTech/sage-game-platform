import { ActionLogEndReason, AnyGameRules } from '@sagegames/types';
import { RuntimeSnapshot } from './GameRuntime';

/** What game views need from a runtime: GameRuntime (local play) and RemoteRuntime both fit. */
export interface PlayableRuntime<TState = unknown> {
  subscribe(listener: () => void): () => void;
  getSnapshot(): RuntimeSnapshot<TState>;
  dispatch(type: string, payload?: unknown): unknown;
  tick(): void;
  finish(reason?: ActionLogEndReason): void;
}

export interface RemoteRuntimeOptions<TState> {
  rules: AnyGameRules;
  /** The player's view of the game, as last sent by the server. */
  state: TState;
  /** Local time the race started (already corrected for clock offset). */
  startedAt: number;
  /** Send a move to the server; `t` is ms since the start on the local clock. */
  send: (t: number, type: string, payload?: unknown) => void;
  now?: () => number;
}

/**
 * Runtime for games with hidden information in battles. The server plays the game and sends
 * the player's view after every change; this only shows it and forwards moves. Nothing secret
 * (seed, card faces, correct answers) is ever on the device.
 */
export class RemoteRuntime<TState = unknown> implements PlayableRuntime<TState> {
  private state: TState;
  private readonly now: () => number;
  private readonly listeners = new Set<() => void>();
  private endedAt: number | null = null;
  private snapshot: RuntimeSnapshot<TState>;

  constructor(private readonly options: RemoteRuntimeOptions<TState>) {
    this.now = options.now ?? Date.now;
    this.state = options.state;
    this.snapshot = this.build();
  }

  /** A new view from the server. */
  public receive(state: TState, t?: number): void {
    this.state = state;
    if (this.options.rules.isOver(state) && this.endedAt === null) this.endedAt = t ?? this.elapsed();
    this.emit();
  }

  /** Forward a move. The board changes when the server's view arrives. */
  public dispatch(type: string, payload?: unknown): 'sent' | 'invalid' | 'ended' {
    if (this.endedAt !== null) return 'ended';
    if (!this.options.rules.parseAction(type, payload)) return 'invalid';
    this.options.send(this.elapsed(), type, payload);
    return 'sent';
  }

  /** Refresh the clock shown to the player. */
  public tick(): void {
    if (this.endedAt === null) this.emit();
  }

  public finish(): void {
    if (this.endedAt !== null) return;
    this.endedAt = this.elapsed();
    this.emit();
  }

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  public getSnapshot = (): RuntimeSnapshot<TState> => this.snapshot;

  private elapsed(): number {
    return Math.max(0, Math.round(this.now() - this.options.startedAt));
  }

  private build(): RuntimeSnapshot<TState> {
    const { rules } = this.options;
    const ended = this.endedAt !== null;
    return {
      state: this.state,
      score: rules.score(this.state),
      progress: rules.progress(this.state),
      started: true,
      paused: false,
      over: rules.isOver(this.state),
      ended,
      elapsedMs: ended ? this.endedAt! : this.elapsed(),
    };
  }

  private emit(): void {
    this.snapshot = this.build();
    this.listeners.forEach((l) => l());
  }
}
