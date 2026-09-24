import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { regionsFor, searchSolutions, sudokuRules, SudokuState, VARIANT_CONFIGS, VARIANT_IDS } from '@sagegames/game-sudoku';
import { expectReplayMatches, startGame } from '../../../test/support/harness';

const puzzleOf = (s: SudokuState) => s.values.map((v, i) => (s.givens[i] ? v : 0));
const openCells = (s: SudokuState) => s.givens.map((g, i) => (g ? -1 : i)).filter((i) => i >= 0);

describe('sudoku variants', () => {
  it.each(VARIANT_IDS)('%s has size regions of size cells each', (id) => {
    const variant = VARIANT_CONFIGS[id];
    const regions = regionsFor(variant);
    const counts = new Map<number, number>();
    regions.forEach((r) => counts.set(r, (counts.get(r) ?? 0) + 1));
    expect(counts.size).toBe(variant.size);
    counts.forEach((n) => expect(n).toBe(variant.size));
  });

  it.each(VARIANT_IDS)('%s generates a uniquely solvable, valid puzzle', (id) => {
    for (const seed of ['u1', 'u2']) {
      const s = sudokuRules.init(seed, sudokuRules.parseConfig({ variant: id, difficulty: 'hard' }));
      expect(searchSolutions(puzzleOf(s), s.size, s.regions, 2).count).toBe(1);
      expect(searchSolutions(s.solution, s.size, s.regions, 2).count).toBe(1); // solution obeys every constraint
      puzzleOf(s).forEach((v, i) => v !== 0 && expect(v).toBe(s.solution[i]));
    }
  });
});

describe('sudoku generation', () => {
  it('is deterministic per seed', () => {
    const config = sudokuRules.parseConfig({});
    expect(sudokuRules.init('same', config)).toEqual(sudokuRules.init('same', config));
    expect(sudokuRules.init('same', config).values).not.toEqual(sudokuRules.init('other', config).values);
  });

  it('keeps the same puzzle for a fixed seed (bump rulesVersion if this changes)', () => {
    const s = sudokuRules.init('fixture-seed', sudokuRules.parseConfig({ variant: '4x4', difficulty: 'easy' }));
    expect({ puzzle: puzzleOf(s), solution: s.solution }).toMatchSnapshot();
  });
});

describe('sudoku play', () => {
  const seed = 'play-seed';

  it('scores 25 per solved cell plus a completion bonus, and replays identically', () => {
    const { runtime, clock, config } = startGame(sudokuRules, seed, { variant: '6x6', difficulty: 'medium' });
    const state = runtime.getSnapshot().state;
    const open = openCells(state);
    for (const cell of open) {
      clock.wait(700);
      runtime.dispatch('ENTER', { cell, value: state.solution[cell] });
    }
    const snap = runtime.getSnapshot();
    expect(snap.over).toBe(true);
    expect(snap.ended).toBe(true);
    expect(snap.score).toBe(open.length * 25 + 500);
    const out = expectReplayMatches(runtime, seed, config);
    expect(out.result.solved).toBe(true);
  });

  it('regression: entering 0 or re-entering a correct value never adds points', () => {
    const { runtime, clock, config } = startGame(sudokuRules, seed);
    const state = runtime.getSnapshot().state;
    const cell = openCells(state)[0];
    const right = state.solution[cell];
    const wrong = (right % state.size) + 1;

    runtime.dispatch('ENTER', { cell, value: right });
    expect(runtime.getSnapshot().score).toBe(25);
    for (let i = 0; i < 10; i++) {
      clock.wait(500);
      runtime.dispatch('ENTER', { cell, value: 0 });
      clock.wait(500);
      runtime.dispatch('ENTER', { cell, value: right });
    }
    expect(runtime.getSnapshot().score).toBe(25);

    clock.wait(500);
    runtime.dispatch('ENTER', { cell, value: wrong });
    expect(runtime.getSnapshot().score).toBe(0);
    expect(runtime.getSnapshot().state.mistakes).toBe(1);
    expectReplayMatches(runtime, seed, config);
  });

  it('regression: a hint costs points only when it fills a cell', () => {
    const { runtime, clock } = startGame(sudokuRules, seed, { variant: '4x4' });
    const state = runtime.getSnapshot().state;
    const open = openCells(state);
    // Solve all but one cell, then hint the last one.
    for (const cell of open.slice(0, -1)) {
      clock.wait(500);
      runtime.dispatch('ENTER', { cell, value: state.solution[cell] });
    }
    const before = runtime.getSnapshot().score;
    clock.wait(500);
    runtime.dispatch('HINT', { cell: state.givens.indexOf(true) }); // a given: falls back to the open cell
    const after = runtime.getSnapshot();
    expect(after.state.hintsUsed).toBe(1);
    expect(after.score).toBe(Math.max(0, before - 100) + 500);
    expect(after.over).toBe(true);

    // Nothing left to hint: free, and ignored because the game is over.
    expect(runtime.dispatch('HINT', {})).toBe('ended');
  });

  it('times out when a time limit is set', () => {
    const { runtime, clock, config } = startGame(sudokuRules, seed, { variant: '4x4', timeLimitSeconds: 60 });
    clock.wait(61_000);
    runtime.tick();
    expect(runtime.getSnapshot().over).toBe(true);
    expect(runtime.getSnapshot().state.timedOut).toBe(true);
    expectReplayMatches(runtime, seed, config);
  });

  it('property: any action sequence replays identically and never goes negative', () => {
    const action = fc.oneof(
      fc.record({ type: fc.constant('ENTER'), payload: fc.record({ cell: fc.nat(40), value: fc.nat(7) }) }),
      fc.record({ type: fc.constant('NOTE'), payload: fc.record({ cell: fc.nat(40), value: fc.nat(7) }) }),
      fc.record({ type: fc.constant('ERASE'), payload: fc.record({ cell: fc.nat(40) }) }),
      fc.record({ type: fc.constant('HINT'), payload: fc.constant({}) })
    );
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.nat(3000), action), { maxLength: 60 }), (steps) => {
        const { runtime, clock, config } = startGame(sudokuRules, 'prop', { variant: '6x6' });
        for (const [wait, a] of steps) {
          clock.wait(wait);
          runtime.dispatch(a.type as 'ENTER', a.payload as { cell: number; value: number });
        }
        const out = expectReplayMatches(runtime, 'prop', config);
        expect(out.score).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 60 }
    );
  });
});
