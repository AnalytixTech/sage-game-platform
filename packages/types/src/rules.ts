/**
 * Deterministic game rules contract.
 *
 * Every game is a pure reducer driven by a seed. The same code runs on the client (to play) and on
 * the server (to replay the recorded action log and compute the authoritative score).
 *
 * Rules must never read the clock or Math.random; time arrives as `tMs` (active play time in
 * milliseconds since the start, with pauses removed) and randomness comes from the seed.
 */

/** Reserved engine-level action types (handled by the engine, never passed to rules). */
export type EngineActionType = '$pause' | '$resume';

/** One recorded action: [t (ms since start, wall clock incl. pauses), type, payload?] */
export type ActionTuple = [t: number, type: string, payload?: unknown];

export type ActionLogEndReason = 'completed' | 'quit' | 'timeout';

export interface ActionLog {
  v: 1;
  gameId: string;
  rulesVersion: number;
  actions: ActionTuple[];
  /** Wall-clock ms since start when play ended. */
  endT: number;
  reason: ActionLogEndReason;
  /** Score the client displayed. Diagnostics only; never trusted. */
  clientScore?: number;
}

export interface RulesAction<TType extends string = string, TPayload = unknown> {
  type: TType;
  payload: TPayload;
}

export type RaceRanking = 'time_then_score' | 'score_then_time';

export interface RulesLimits<TConfig> {
  /** Hard cap on logged actions. */
  maxActions: number;
  /** Hard cap on active play time for a config. */
  maxDurationMs(config: TConfig): number;
  /** Actions arriving faster than this (on average) are flagged as implausible. */
  minActionIntervalMs?: number;
  /** Whether the player may pause. When false, pause actions are ignored and time keeps running. */
  allowPause: boolean;
}

export interface GameRules<TConfig, TState, TAction extends RulesAction, TResult> {
  gameId: string;
  rulesVersion: number;

  /** Apply defaults, validate and clamp host-supplied config. Throws ConfigError on invalid input. */
  parseConfig(input: unknown): TConfig;

  /** Deterministically build the starting state from the seed. */
  init(seed: string, config: TConfig): TState;

  /** Structural validation of a raw action. Returns null when malformed. */
  parseAction(type: string, payload: unknown): TAction | null;

  /**
   * Time-driven transitions (question timeouts, timer expiry). Must be composable:
   * advance(advance(s, t1), t2) === advance(s, t2) for t1 <= t2.
   */
  advance(state: TState, tMs: number): TState;

  /** Apply an action. Pure; never throws. Illegal moves return an unchanged or penalised state. */
  reduce(state: TState, action: TAction, tMs: number): TState;

  isOver(state: TState): boolean;
  score(state: TState): number;
  /** 0..1, used for live battle progress. */
  progress(state: TState): number;
  result(state: TState): TResult;

  limits: RulesLimits<TConfig>;
  race: { ranking: RaceRanking };

  /** Optional soft checks; returned codes are stored as flags and exclude the result from leaderboards. */
  plausibility?(state: TState, log: ActionLog): string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGameRules = GameRules<any, any, any, any>;

export interface ReplayOutcome<TState = unknown, TResult = unknown> {
  state: TState;
  score: number;
  result: TResult;
  over: boolean;
  /** Active play time in ms (pauses removed). */
  activeMs: number;
  flags: string[];
}
