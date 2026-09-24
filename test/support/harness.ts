import { expect } from 'vitest';
import { GameRules, ReplayOutcome, RulesAction } from '@sagegames/types';
import { GameRuntime } from '@sagegames/core';
import { replay } from '@sagegames/engine';

export interface FakeClock {
  now: () => number;
  wait: (ms: number) => void;
}

export function fakeClock(start = 1_700_000_000_000): FakeClock {
  let t = start;
  return {
    now: () => t,
    wait: (ms) => {
      t += ms;
    },
  };
}

/** Start a runtime on a fake clock with a config parsed by the rules. */
export function startGame<C, S, A extends RulesAction, R>(
  rules: GameRules<C, S, A, R>,
  seed: string,
  rawConfig: unknown = {}
) {
  const clock = fakeClock();
  const config = rules.parseConfig(rawConfig);
  const runtime = new GameRuntime({ rules, seed, config, now: clock.now });
  runtime.start();
  return { runtime, clock, config };
}

/** Replay the runtime's log on the "server" and assert it reproduces the client exactly. */
export function expectReplayMatches<C, S, A extends RulesAction, R>(
  runtime: GameRuntime<C, S, A, R>,
  seed: string,
  config: C,
  serverElapsedMs?: number
): ReplayOutcome<S, R> {
  runtime.finish('quit'); // no-op when already finished
  const client = runtime.getSnapshot();
  const outcome = replay(runtime.rules, { seed, config, log: JSON.parse(JSON.stringify(runtime.getLog())), serverElapsedMs });
  expect(outcome.score).toBe(client.score);
  expect(outcome.state).toEqual(client.state);
  expect(outcome.over).toBe(client.over);
  return outcome;
}
