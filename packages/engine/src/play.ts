import { GameRules, RulesAction } from '@sagegames/types';
import { isNonNegativeInt } from './util';

export type ApplyOutcome =
  /** The action changed (or may have changed) the game state. */
  | 'applied'
  /** Well-formed but had no effect (e.g. arrived after the game ended, or while paused). */
  | 'ignored'
  /** Malformed action; an honest client never records one. */
  | 'invalid'
  /** Timestamp is not a non-negative integer or went backwards. */
  | 'bad_time'
  /** finish() was already called. */
  | 'ended';

/**
 * The single play loop used by both the client runtime and the server replay, so both
 * compute exactly the same state from the same inputs.
 *
 * `t` is wall-clock milliseconds since play started. Pauses are tracked here and removed
 * before time reaches the rules, which only ever see active play time.
 */
export class Play<TConfig, TState, TAction extends RulesAction, TResult> {
  public state: TState;
  public lastT = 0;
  public paused = false;
  public actionCount = 0;
  public ended = false;
  public endT: number | null = null;

  /** Active play time reached rules.limits.maxDurationMs; the game is over. */
  public expired = false;

  private pauseStartedAt = 0;
  private pausedTotal = 0;
  private readonly limitMs: number;

  constructor(
    public readonly rules: GameRules<TConfig, TState, TAction, TResult>,
    public readonly seed: string,
    public readonly config: TConfig
  ) {
    this.state = rules.init(seed, config);
    this.limitMs = rules.limits.maxDurationMs(config);
  }

  /** Active (unpaused) time at wall-clock time t. */
  public activeTime(t: number): number {
    const currentPause = this.paused ? t - this.pauseStartedAt : 0;
    return Math.max(0, t - this.pausedTotal - currentPause);
  }

  /** Active play time so far, capped at the maximum play time. */
  public get activeMs(): number {
    return Math.min(this.activeTime(this.endT ?? this.lastT), this.limitMs);
  }

  /** Over by the rules, or because the maximum play time ran out. */
  public get over(): boolean {
    return this.expired || this.rules.isOver(this.state);
  }

  /** Advance timers without recording anything (used by client ticks). */
  public advanceTo(t: number): void {
    if (this.ended || !isNonNegativeInt(t) || t < this.lastT) return;
    this.advanceActive(this.activeTime(t));
  }

  public apply(t: number, type: string, payload?: unknown): ApplyOutcome {
    if (this.ended) return 'ended';
    if (!isNonNegativeInt(t) || t < this.lastT) return 'bad_time';

    this.lastT = t;
    this.actionCount += 1;

    if (type === '$pause') {
      if (!this.rules.limits.allowPause || this.paused) return 'ignored';
      this.advanceActive(this.activeTime(t));
      this.paused = true;
      this.pauseStartedAt = t;
      return 'applied';
    }

    if (type === '$resume') {
      if (!this.paused) return 'ignored';
      this.pausedTotal += t - this.pauseStartedAt;
      this.paused = false;
      return 'applied';
    }

    const action = this.rules.parseAction(type, payload);
    if (!action) return 'invalid';
    if (this.paused) return 'ignored';

    const active = this.activeTime(t);
    this.advanceActive(active);
    if (this.over) return 'ignored';

    this.state = this.rules.reduce(this.state, action, active);
    return 'applied';
  }

  /** End play at wall-clock time endT, running any final timer transitions. */
  public finish(endT: number): boolean {
    if (this.ended) return false;
    if (!isNonNegativeInt(endT) || endT < this.lastT) return false;
    this.advanceActive(this.activeTime(endT));
    this.endT = endT;
    this.ended = true;
    return true;
  }

  /**
   * Run time-driven transitions. Time never advances past the maximum play time: reaching it
   * ends the game (like a timer running out) rather than invalidating the log.
   */
  private advanceActive(active: number): void {
    this.state = this.rules.advance(this.state, Math.min(active, this.limitMs));
    if (active >= this.limitMs) this.expired = true;
  }
}
