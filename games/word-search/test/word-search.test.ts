import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { normalizeToken, wordSearchRules, WordSearchState } from '@sagegames/game-word-search';
import { expectReplayMatches, startGame } from '../../../test/support/harness';

const toCell = (s: WordSearchState, idx: number): [number, number] => [Math.floor(idx / s.size), idx % s.size];

// Japabudz's production config: IMMIGRATION and SCHOLARSHIP are 11 letters on a 10-wide grid.
const JAPABUDZ_CONFIG = {
  categoryName: 'Custom Terms',
  wordSelectionMode: 'combine',
  words: [
    { token: 'PASSPORT', display: 'Passport' },
    { token: 'VISA', display: 'Visa' },
    { token: 'IMMIGRATION', display: 'Immigration' },
    { token: 'CAMPUS', display: 'Campus' },
    { token: 'SCHOLARSHIP', display: 'Scholarship' },
  ],
  gridSize: 10,
  difficulty: 'medium',
};

describe('word search', () => {
  it('normalises tokens the same way for placing and matching', () => {
    expect(normalizeToken('Ice-Cream 2')).toBe('ICECREAM');
  });

  it('regression: grows the grid instead of silently dropping long words', () => {
    const s = wordSearchRules.init('japa', wordSearchRules.parseConfig(JAPABUDZ_CONFIG));
    expect(s.size).toBeGreaterThanOrEqual(11); // at least the longest word; more if needed to fit everything
    expect(s.words.map((w) => w.token)).toEqual(expect.arrayContaining(['IMMIGRATION', 'SCHOLARSHIP']));
    expect(s.skippedWords).toEqual([]);
  });

  it('reports words longer than the maximum grid instead of dropping them silently', () => {
    const s = wordSearchRules.init(
      'long',
      wordSearchRules.parseConfig({ words: [{ token: 'ANTIDISESTABLISHMENT' }, { token: 'SHORT' }] })
    );
    expect(s.skippedWords).toEqual(['ANTIDISESTABLISHMENT']);
    expect(s.words.map((w) => w.token)).toEqual(['SHORT']);
  });

  it('places every word letter-for-letter on the grid, deterministically', () => {
    const config = wordSearchRules.parseConfig(JAPABUDZ_CONFIG);
    const s = wordSearchRules.init('placement', config);
    for (const w of s.words) {
      expect(w.cells.map((i) => s.grid[Math.floor(i / s.size)][i % s.size]).join('')).toBe(w.token);
    }
    expect(wordSearchRules.init('placement', config)).toEqual(s);
    expect(wordSearchRules.init('fixture-seed', config).grid.map((r) => r.join(''))).toMatchSnapshot();
  });

  it('regression: custom words with spaces or hyphens can be found', () => {
    const { runtime, config } = startGame(wordSearchRules, 'spaces', {
      words: [{ token: 'ICE CREAM', display: 'Ice cream' }, { token: 'E-MAIL', display: 'E-mail' }],
    });
    for (const w of runtime.getSnapshot().state.words) {
      const s = runtime.getSnapshot().state;
      runtime.dispatch('SELECT', { from: toCell(s, w.cells[0]), to: toCell(s, w.cells[w.cells.length - 1]) });
    }
    expect(runtime.getSnapshot().state.foundCount).toBe(2);
    expect(runtime.getSnapshot().over).toBe(true);
    expectReplayMatches(runtime, 'spaces', config);
  });

  it('regression: a bare token string is no longer accepted as a find', () => {
    expect(wordSearchRules.parseAction('FOUND_WORD', 'SAGE')).toBeNull();
    expect(wordSearchRules.parseAction('SELECT', 'SAGE')).toBeNull();
  });

  it('accepts selections in either direction, scores length x 100 and replays identically', () => {
    const { runtime, clock, config } = startGame(wordSearchRules, 'solve', JAPABUDZ_CONFIG);
    let expected = 0;
    runtime.getSnapshot().state.words.forEach((w, i) => {
      const s = runtime.getSnapshot().state;
      const first = toCell(s, w.cells[0]);
      const last = toCell(s, w.cells[w.cells.length - 1]);
      clock.wait(3000);
      runtime.dispatch('SELECT', i % 2 ? { from: last, to: first } : { from: first, to: last });
      expected += w.token.length * 100;
    });
    const snap = runtime.getSnapshot();
    expect(snap.over).toBe(true);
    expect(snap.score).toBe(expected + 500);
    expectReplayMatches(runtime, 'solve', config);
  });

  it('wrong selections never raise the score', () => {
    const { runtime, clock } = startGame(wordSearchRules, 'wrong');
    runtime.dispatch('SELECT', { from: [0, 0], to: [0, 1] });
    clock.wait(500);
    runtime.dispatch('SELECT', { from: [0, 0], to: [2, 1] }); // not a straight line
    expect(runtime.getSnapshot().score).toBe(0);
    expect(runtime.getSnapshot().state.invalidSelections).toBe(2);
  });

  it('property: random selections replay identically', () => {
    const cell = fc.tuple(fc.nat(13), fc.nat(13));
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.nat(3000), cell, cell), { maxLength: 60 }), (steps) => {
        const { runtime, clock, config } = startGame(wordSearchRules, 'prop');
        for (const [wait, from, to] of steps) {
          clock.wait(wait);
          runtime.dispatch('SELECT', { from, to });
        }
        expect(expectReplayMatches(runtime, 'prop', config).score).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 60 }
    );
  });
});
