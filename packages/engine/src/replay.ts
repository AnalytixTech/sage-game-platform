import { ActionLog, GameRules, ReplayOutcome, RulesAction } from '@sagegames/types';
import { ReplayRejected } from './errors';
import { parseActionLog } from './log';
import { Play } from './play';

export interface ReplayInput<TConfig> {
  seed: string;
  /** Config as already resolved by rules.parseConfig when the session was created. */
  config: TConfig;
  /** Untrusted log received from the client. */
  log: unknown;
  /** Wall-clock ms the server observed between session start and receiving the log. */
  serverElapsedMs?: number;
}

/** Slack for clock drift and network latency between client and server. */
export const CLOCK_TOLERANCE_MS = 5000;

/**
 * Re-run an action log through the rules and return the authoritative outcome.
 * Throws ReplayRejected when the log could not come from an honest client.
 */
export function replay<TConfig, TState, TAction extends RulesAction, TResult>(
  rules: GameRules<TConfig, TState, TAction, TResult>,
  input: ReplayInput<TConfig>
): ReplayOutcome<TState, TResult> {
  const log: ActionLog = parseActionLog(input.log);

  if (log.gameId !== rules.gameId) {
    throw new ReplayRejected('game_mismatch', `log is for ${log.gameId}, expected ${rules.gameId}`);
  }
  if (log.rulesVersion !== rules.rulesVersion) {
    throw new ReplayRejected('rules_version_mismatch', `log v${log.rulesVersion}, server v${rules.rulesVersion}`);
  }
  if (log.actions.length > rules.limits.maxActions) {
    throw new ReplayRejected('too_many_actions', `${log.actions.length} > ${rules.limits.maxActions}`);
  }

  const play = new Play(rules, input.seed, input.config);

  log.actions.forEach(([t, type, payload], i) => {
    const outcome = play.apply(t, type, payload);
    if (outcome === 'bad_time') throw new ReplayRejected('bad_timestamp', `actions[${i}]`);
    if (outcome === 'invalid') throw new ReplayRejected('invalid_action', `actions[${i}] (${type})`);
  });

  if (input.serverElapsedMs !== undefined && log.endT > input.serverElapsedMs + CLOCK_TOLERANCE_MS) {
    throw new ReplayRejected('time_exceeds_server', `endT ${log.endT}ms > server ${input.serverElapsedMs}ms`);
  }
  if (!play.finish(log.endT)) {
    throw new ReplayRejected('bad_timestamp', 'endT is before the last action');
  }

  // No duration check: play time is capped at rules.limits.maxDurationMs (reaching it ends the
  // game), and the serverElapsedMs check above bounds how long a log can claim to be.
  return {
    state: play.state,
    score: rules.score(play.state),
    result: rules.result(play.state),
    over: play.over,
    activeMs: play.activeMs,
    flags: collectFlags(rules, play.state, log, input.serverElapsedMs),
  };
}

function collectFlags<TConfig, TState, TAction extends RulesAction, TResult>(
  rules: GameRules<TConfig, TState, TAction, TResult>,
  state: TState,
  log: ActionLog,
  serverElapsedMs: number | undefined
): string[] {
  const flags: string[] = [];

  // Gameplay actions arriving faster than a human could make them.
  const minInterval = rules.limits.minActionIntervalMs;
  const moves = log.actions.filter(([, type]) => !type.startsWith('$'));
  if (minInterval && moves.length >= 5) {
    const span = moves[moves.length - 1][0] - moves[0][0];
    if (span / (moves.length - 1) < minInterval) flags.push('actions_too_fast');
  }

  // The client claims far less play time than the server observed (time compression).
  if (serverElapsedMs !== undefined && serverElapsedMs - log.endT > Math.max(60000, log.endT)) {
    flags.push('time_compressed');
  }

  if (rules.plausibility) flags.push(...rules.plausibility(state, log));
  return flags;
}
