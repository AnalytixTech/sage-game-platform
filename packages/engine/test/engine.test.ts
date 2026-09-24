import { describe, expect, it } from 'vitest';
import { GameRules, RulesAction } from '@sagegames/types';
import { createRng, Play, replay, ReplayRejected } from '@sagegames/engine';

describe('prng', () => {
  it('produces the golden sequence (guards against drift across engines and refactors)', () => {
    const r = createRng('sage-golden-seed');
    expect([r.nextU32(), r.nextU32(), r.nextU32(), r.int(100), r.int(7)]).toEqual([
      4158015415, 1232719964, 2568760776, 40, 1,
    ]);
    expect(r.shuffle([1, 2, 3, 4, 5, 6, 7, 8])).toEqual([8, 2, 6, 5, 4, 1, 7, 3]);
    expect(r.fork('x').nextU32()).toBe(2701010512);
  });

  it('is deterministic per seed and differs between seeds', () => {
    const a = createRng('seed-a');
    const b = createRng('seed-a');
    const c = createRng('seed-b');
    const seqA = Array.from({ length: 20 }, () => a.nextU32());
    expect(Array.from({ length: 20 }, () => b.nextU32())).toEqual(seqA);
    expect(Array.from({ length: 20 }, () => c.nextU32())).not.toEqual(seqA);
  });

  it('int(n) stays in range and covers every value', () => {
    const r = createRng('range');
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const v = r.int(7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
      seen.add(v);
    }
    expect(seen.size).toBe(7);
  });

  it('shuffle returns a permutation and leaves the input untouched', () => {
    const input = [1, 2, 3, 4, 5, 6];
    const out = createRng('shuffle').shuffle(input);
    expect(out.slice().sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('forks are independent of how much the parent has been used', () => {
    const fresh = createRng('parent').fork('child').nextU32();
    const used = createRng('parent');
    used.nextU32();
    used.nextU32();
    expect(used.fork('child').nextU32()).toBe(fresh);
  });
});

// A tiny game: ADD n adds n points (1..9); a 10s limit; over at 100 points.
interface Counter {
  total: number;
  elapsedMs: number;
  timeUp: boolean;
}
type CounterAction = RulesAction<'ADD', number>;

const counterRules: GameRules<{ limitMs: number }, Counter, CounterAction, { total: number }> = {
  gameId: 'counter',
  rulesVersion: 1,
  parseConfig: () => ({ limitMs: 10000 }),
  init: () => ({ total: 0, elapsedMs: 0, timeUp: false }),
  parseAction: (type, payload) =>
    type === 'ADD' && typeof payload === 'number' && Number.isInteger(payload) && payload >= 1 && payload <= 9
      ? { type: 'ADD', payload }
      : null,
  advance: (s, t) => (t <= s.elapsedMs ? s : { ...s, elapsedMs: t, timeUp: s.timeUp || t >= 10000 }),
  reduce: (s, a) => ({ ...s, total: s.total + a.payload }),
  isOver: (s) => s.timeUp || s.total >= 100,
  score: (s) => s.total,
  progress: (s) => s.total / 100,
  result: (s) => ({ total: s.total }),
  limits: { maxActions: 50, maxDurationMs: (c) => c.limitMs, minActionIntervalMs: 100, allowPause: true },
  race: { ranking: 'score_then_time' },
};

const log = (actions: [number, string, unknown?][], endT: number, extra: object = {}) => ({
  v: 1,
  gameId: 'counter',
  rulesVersion: 1,
  actions,
  endT,
  reason: 'quit',
  ...extra,
});

const run = (l: unknown, serverElapsedMs?: number) =>
  replay(counterRules, { seed: 's', config: { limitMs: 10000 }, log: l, serverElapsedMs });

const rejectCode = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof ReplayRejected) return e.code;
    throw e;
  }
  return null;
};

describe('replay', () => {
  it('computes the authoritative score and ignores the client score', () => {
    const out = run(log([[1000, 'ADD', 5], [2000, 'ADD', 7]], 3000, { clientScore: 99999 }));
    expect(out.score).toBe(12);
    expect(out.activeMs).toBe(3000);
  });

  it('ignores actions after the time limit', () => {
    const out = run(log([[1000, 'ADD', 5], [12000, 'ADD', 9]], 12000));
    expect(out.score).toBe(5);
    expect(out.over).toBe(true);
  });

  it('removes paused time from active time', () => {
    // Paused from 2s to 30s: the ADD at 31s is 3s of active time, well inside the limit.
    const out = run(log([[1000, 'ADD', 1], [2000, '$pause'], [30000, '$resume'], [31000, 'ADD', 2]], 32000));
    expect(out.score).toBe(3);
    expect(out.activeMs).toBe(4000);
  });

  it('ignores gameplay actions sent while paused', () => {
    const out = run(log([[1000, '$pause'], [2000, 'ADD', 9], [3000, '$resume']], 4000));
    expect(out.score).toBe(0);
  });

  it.each([
    ['malformed_log', { nope: true }],
    ['malformed_log', log([[1.5, 'ADD', 1]], 2)],
    ['bad_timestamp', log([[2000, 'ADD', 1], [1000, 'ADD', 1]], 3000)],
    ['bad_timestamp', log([[2000, 'ADD', 1]], 1000)],
    ['invalid_action', log([[1000, 'ADD', 50]], 2000)],
    ['invalid_action', log([[1000, 'CHEAT']], 2000)],
    ['too_many_actions', log(Array.from({ length: 51 }, (_, i) => [i * 150, 'ADD', 1] as [number, string, unknown]), 9000)],
    ['game_mismatch', { ...log([], 0), gameId: 'other' }],
    ['rules_version_mismatch', { ...log([], 0), rulesVersion: 2 }],
  ])('rejects %s', (code, bad) => {
    expect(rejectCode(() => run(bad))).toBe(code);
  });

  it('ends the game at the maximum play time instead of rejecting a late finish', () => {
    // An app that was backgrounded past the limit finishes late; that is not cheating.
    const out = run(log([[1000, 'ADD', 5], [15000, 'ADD', 9]], 60000));
    expect(out.score).toBe(5);
    expect(out.over).toBe(true);
    expect(out.activeMs).toBe(10000);
  });

  it('rejects logs claiming more time than the server observed', () => {
    expect(rejectCode(() => run(log([[1000, 'ADD', 1]], 9000), 2000))).toBe('time_exceeds_server');
    expect(rejectCode(() => run(log([[1000, 'ADD', 1]], 6000), 2000))).toBeNull(); // within tolerance
  });

  it('flags actions faster than a human could make them', () => {
    const fast = log(Array.from({ length: 10 }, (_, i) => [i * 10, 'ADD', 1] as [number, string, unknown]), 200);
    expect(run(fast).flags).toContain('actions_too_fast');
    const normal = log(Array.from({ length: 10 }, (_, i) => [i * 500, 'ADD', 1] as [number, string, unknown]), 6000);
    expect(run(normal).flags).toEqual([]);
  });
});

describe('Play', () => {
  it('refuses pauses when the game disallows them', () => {
    const noPause = { ...counterRules, limits: { ...counterRules.limits, allowPause: false } };
    const play = new Play(noPause, 's', { limitMs: 10000 });
    expect(play.apply(1000, '$pause')).toBe('ignored');
    expect(play.apply(2000, 'ADD', 3)).toBe('applied');
  });
});
