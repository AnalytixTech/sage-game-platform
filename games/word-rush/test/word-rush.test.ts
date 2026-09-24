import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { areAdjacent, isDictionaryWord, wordPoints, wordRushRules, WordRushState } from '@sagegames/game-word-rush';
import { expectReplayMatches, startGame } from '../../../test/support/harness';

/** Depth-first search for dictionary words on the grid (paths up to `maxTiles` tiles). */
function findWords(state: WordRushState, maxTiles = 5): Map<string, number[]> {
  const found = new Map<string, number[]>();
  const cells = state.size * state.size;
  const walk = (path: number[]) => {
    const word = path.map((i) => state.grid[i]).join('').toLowerCase();
    if (word.length >= 3 && !found.has(word) && isDictionaryWord(word)) found.set(word, path);
    if (path.length === maxTiles) return;
    for (let next = 0; next < cells; next++) {
      if (!path.includes(next) && areAdjacent(state.size, path[path.length - 1], next)) walk([...path, next]);
    }
  };
  for (let start = 0; start < cells; start++) walk([start]);
  return found;
}

describe('word rush', () => {
  it('rolls a deterministic grid from the seed', () => {
    const config = wordRushRules.parseConfig({});
    expect(wordRushRules.init('g', config)).toEqual(wordRushRules.init('g', config));
    expect(wordRushRules.init('g', config).grid).not.toEqual(wordRushRules.init('h', config).grid);
    expect(wordRushRules.init('fixture-seed', config).grid.join(' ')).toMatchSnapshot();
    expect(wordRushRules.init('five', wordRushRules.parseConfig({ size: 5 })).grid).toHaveLength(25);
  });

  it('scores real words found on the grid and replays identically', () => {
    const { runtime, clock, config } = startGame(wordRushRules, 'words');
    const words = Array.from(findWords(runtime.getSnapshot().state).entries()).slice(0, 10);
    expect(words.length).toBeGreaterThan(3);
    let expected = 0;
    for (const [word, path] of words) {
      clock.wait(3000);
      runtime.dispatch('SUBMIT', { path });
      expected += wordPoints(word.length);
    }
    expect(runtime.getSnapshot().score).toBe(expected);
    expect(runtime.getSnapshot().state.found).toHaveLength(words.length);
    expectReplayMatches(runtime, 'words', config);
  });

  it('regression: strings that are not words, not on the grid or repeated score nothing', () => {
    const { runtime, clock } = startGame(wordRushRules, 'cheat');
    const state = runtime.getSnapshot().state;
    const [[, path]] = Array.from(findWords(state).entries());

    runtime.dispatch('SUBMIT', { path });
    const score = runtime.getSnapshot().score;
    expect(score).toBeGreaterThan(0);

    clock.wait(500);
    runtime.dispatch('SUBMIT', { path }); // repeat
    expect(runtime.getSnapshot().state.last?.rejected).toBe('already_found');

    clock.wait(500);
    runtime.dispatch('SUBMIT', { path: [0, 5, 10, 15, 0] }); // reuses a tile
    expect(runtime.getSnapshot().state.last?.rejected).toBe('not_adjacent');

    clock.wait(500);
    runtime.dispatch('SUBMIT', { path: [0, 2, 3] }); // 0 and 2 are not adjacent
    expect(runtime.getSnapshot().state.last?.rejected).toBe('not_adjacent');

    expect(wordRushRules.parseAction('SUBMIT_WORD', 'AAAAAAAAAAAAAAAAAAAAAA')).toBeNull();
    expect(runtime.getSnapshot().score).toBe(score);
  });

  it('regression: the timer ends the game and later submissions are ignored', () => {
    const { runtime, clock, config } = startGame(wordRushRules, 'timer', { durationSeconds: 30 });
    const [[, path]] = Array.from(findWords(runtime.getSnapshot().state).entries());
    clock.wait(31_000);
    // No tick ran (e.g. the app was in the background): the late submission is ignored and ends play.
    expect(runtime.dispatch('SUBMIT', { path })).toBe('ignored');
    expect(runtime.getLog().reason).toBe('completed');
    expect(runtime.getSnapshot().over).toBe(true);
    expect(runtime.getSnapshot().score).toBe(0);
    expectReplayMatches(runtime, 'timer', config);
  });

  it('property: random paths replay identically', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.nat(3000), fc.array(fc.nat(17), { minLength: 2, maxLength: 7 })), { maxLength: 40 }),
        (steps) => {
          const { runtime, clock, config } = startGame(wordRushRules, 'prop');
          for (const [wait, path] of steps) {
            clock.wait(wait);
            runtime.dispatch('SUBMIT', { path });
          }
          expect(expectReplayMatches(runtime, 'prop', config).score).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 60 }
    );
  });
});
