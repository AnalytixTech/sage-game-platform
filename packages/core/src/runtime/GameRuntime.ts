import { ActionLog, ActionLogEndReason, ActionTuple, GameRules, RulesAction } from '@sagegames/types';
import { ApplyOutcome, Play } from '@sagegames/engine';

export interface GameRuntimeOptions<TConfig, TState, TAction extends RulesAction, TResult> {
  rules: GameRules<TConfig, TState, TAction, TResult>;
  seed: string;
  /** Config as resolved by the server (or rules.parseConfig for offline play). */
  config: TConfig;
  /** Clock source; defaults to Date.now. Injected in tests. */
  now?: () => number;
}

export interface RuntimeSnapshot<TState> {
  state: TState;
  score: number;
  progress: number;
  started: boolean;
  paused: boolean;
  over: boolean;
  ended: boolean;
  /** Active play time in ms (pauses excluded). */
  elapsedMs: number;
}

type Listener = () => void;

/**
 * Client-side game runner. Plays the game through the same Play loop the server uses to
 * replay, and records every accepted action so the log can be submitted for verification.
 *
 * Works with React's useSyncExternalStore via subscribe/getSnapshot.
 */
export class GameRuntime<TConfig, TState, TAction extends RulesAction, TResult> {
  private readonly play: Play<TConfig, TState, TAction, TResult>;
  private readonly now: () => number;
  private readonly actions: ActionTuple[] = [];
  private readonly listeners = new Set<Listener>();
  private startedAt: number | null = null;
  private endReason: ActionLogEndReason | null = null;
  private snapshot: RuntimeSnapshot<TState>;

  constructor(private readonly options: GameRuntimeOptions<TConfig, TState, TAction, TResult>) {
    this.now = options.now ?? Date.now;
    this.play = new Play(options.rules, options.seed, options.config);
    this.snapshot = this.buildSnapshot();
  }

  public get rules(): GameRules<TConfig, TState, TAction, TResult> {
    return this.options.rules;
  }

  public start(): void {
    if (this.startedAt !== null) return;
    this.startedAt = this.now();
    this.emit();
  }

  /** Apply a player action. Only actions the engine accepts are recorded. */
  public dispatch(type: TAction['type'], payload?: TAction['payload']): ApplyOutcome {
    if (this.startedAt === null || this.play.ended) return 'ended';

    const t = this.clock();
    const outcome = this.play.apply(t, type, payload);
    if (outcome === 'applied') {
      this.actions.push(payload === undefined ? [t, type] : [t, type, payload]);
    }

    if (this.play.over) {
      this.finish(this.overReason());
    } else {
      this.emit();
    }
    return outcome;
  }

  public pause(): boolean {
    return this.dispatchEngine('$pause');
  }

  public resume(): boolean {
    return this.dispatchEngine('$resume');
  }

  /** Advance timers (call on an interval while playing). Not recorded: replay reproduces it. */
  public tick(): void {
    if (this.startedAt === null || this.play.ended) return;
    const before = this.play.state;
    this.play.advanceTo(this.clock());
    if (this.play.over) {
      this.finish(this.overReason());
    } else if (this.play.state !== before) {
      this.emit();
    }
  }

  /** End play. Called automatically with 'completed' when the game is over. */
  public finish(reason: ActionLogEndReason = 'quit'): void {
    if (this.startedAt === null || this.play.ended) return;
    this.play.finish(this.clock());
    this.endReason = reason;
    this.emit();
  }

  /** The log to submit to the server for verification. Available once play has ended. */
  public getLog(): ActionLog {
    if (!this.play.ended || this.play.endT === null || this.endReason === null) {
      throw new Error('GameRuntime.getLog() is only available after finish()');
    }
    return {
      v: 1,
      gameId: this.options.rules.gameId,
      rulesVersion: this.options.rules.rulesVersion,
      actions: this.actions.slice(),
      endT: this.play.endT,
      reason: this.endReason,
      clientScore: this.options.rules.score(this.play.state),
    };
  }

  public subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Stable between changes, as required by useSyncExternalStore. */
  public getSnapshot = (): RuntimeSnapshot<TState> => this.snapshot;

  private dispatchEngine(type: '$pause' | '$resume'): boolean {
    if (this.startedAt === null || this.play.ended) return false;
    const t = this.clock();
    const outcome = this.play.apply(t, type);
    if (outcome !== 'applied') return false;
    this.actions.push([t, type]);
    this.emit();
    return true;
  }

  /** Ran out of time (max play time or timer) versus finished by the rules. */
  private overReason(): ActionLogEndReason {
    return this.play.expired && !this.options.rules.isOver(this.play.state) ? 'timeout' : 'completed';
  }

  /** Integer ms since start, never going backwards. */
  private clock(): number {
    const elapsed = Math.round(this.now() - (this.startedAt ?? 0));
    return Math.max(this.play.lastT, elapsed, 0);
  }

  private buildSnapshot(): RuntimeSnapshot<TState> {
    const { rules } = this.options;
    const state = this.play.state;
    return {
      state,
      score: rules.score(state),
      progress: rules.progress(state),
      started: this.startedAt !== null,
      paused: this.play.paused,
      over: this.play.over,
      ended: this.play.ended,
      elapsedMs:
        this.startedAt === null ? 0 : this.play.ended ? this.play.activeMs : this.play.activeTime(this.clock()),
    };
  }

  private emit(): void {
    this.snapshot = this.buildSnapshot();
    this.listeners.forEach((listener) => listener());
  }
}
