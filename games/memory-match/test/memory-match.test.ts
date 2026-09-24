import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { memoryMatchRules, MemoryMatchState } from '@sagegames/game-memory-match';
import { expectReplayMatches, startGame } from '../../../test/support/harness';

const pairsOf = (s: MemoryMatchState) => {
  const byFace = new Map<string, number[]>();
  s.cards.forEach((c, i) => byFace.set(c.face, [...(byFace.get(c.face) ?? []), i]));
  return Array.from(byFace.values());
};

describe('memory match', () => {
  it('deals a deterministic deck of pairs per seed', () => {
    const config = memoryMatchRules.parseConfig({ pairCount: 8 });
    const a = memoryMatchRules.init('deck', config);
    expect(a).toEqual(memoryMatchRules.init('deck', config));
    expect(a.cards.map((c) => c.face)).not.toEqual(memoryMatchRules.init('other', config).cards.map((c) => c.face));
    expect(a.cards).toHaveLength(16);
    pairsOf(a).forEach((pair) => expect(pair).toHaveLength(2));
  });

  it('keeps the same deck for a fixed seed (bump rulesVersion if this changes)', () => {
    expect(memoryMatchRules.init('fixture-seed', memoryMatchRules.parseConfig({})).cards.map((c) => c.face)).toMatchSnapshot();
  });

  it('a perfect game scores every pair with the flawless bonus and replays identically', () => {
    const { runtime, clock, config } = startGame(memoryMatchRules, 'perfect');
    for (const [a, b] of pairsOf(runtime.getSnapshot().state)) {
      clock.wait(600);
      runtime.dispatch('FLIP', { index: a });
      clock.wait(600);
      runtime.dispatch('FLIP', { index: b });
    }
    const snap = runtime.getSnapshot();
    expect(snap.over).toBe(true);
    expect(snap.score).toBe(6 * 150);
    expect(snap.state.flawlessMatches).toBe(6);
    expectReplayMatches(runtime, 'perfect', config);
  });

  it('regression: a mismatched pair stays visible until the next flip', () => {
    const { runtime, clock } = startGame(memoryMatchRules, 'mismatch');
    const [[a], [b]] = pairsOf(runtime.getSnapshot().state);
    runtime.dispatch('FLIP', { index: a });
    clock.wait(500);
    runtime.dispatch('FLIP', { index: b });

    let s = runtime.getSnapshot().state;
    expect(s.mismatch).toBe(true);
    expect(s.revealed).toEqual([a, b]);

    const c = s.cards.findIndex((_, i) => i !== a && i !== b);
    clock.wait(500);
    runtime.dispatch('FLIP', { index: c });
    s = runtime.getSnapshot().state;
    expect(s.mismatch).toBe(false);
    expect(s.revealed).toEqual([c]);
  });

  it('flipping matched cards or the same card twice changes nothing', () => {
    const { runtime, clock } = startGame(memoryMatchRules, 'noop');
    const [[a, b]] = pairsOf(runtime.getSnapshot().state);
    runtime.dispatch('FLIP', { index: a });
    clock.wait(500);
    runtime.dispatch('FLIP', { index: a });
    expect(runtime.getSnapshot().state.revealed).toEqual([a]);
    clock.wait(500);
    runtime.dispatch('FLIP', { index: b });
    const score = runtime.getSnapshot().score;
    for (let i = 0; i < 5; i++) {
      clock.wait(500);
      runtime.dispatch('FLIP', { index: a });
    }
    expect(runtime.getSnapshot().score).toBe(score);
  });

  it('property: random flips replay identically and the score stays within bounds', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.nat(2000), fc.nat(14)), { maxLength: 80 }), (steps) => {
        const { runtime, clock, config } = startGame(memoryMatchRules, 'prop');
        for (const [wait, index] of steps) {
          clock.wait(wait);
          runtime.dispatch('FLIP', { index });
        }
        const out = expectReplayMatches(runtime, 'prop', config);
        expect(out.score).toBeGreaterThanOrEqual(0);
        expect(out.score).toBeLessThanOrEqual(6 * 150);
      }),
      { numRuns: 100 }
    );
  });
});
