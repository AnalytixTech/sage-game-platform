import { describe, expect, it } from 'vitest';
import { wordSearchRules, WordSearchState } from '@sagegames/game-word-search';
import {
  defaultLabels,
  definedWordAt,
  emptySelection,
  GridCell,
  initialReview,
  launcherView,
  reviewReducer,
  reviewStat,
  reviewTitle,
  SelectionContext,
  SelectionEffect,
  SelectionState,
  selectionStep,
} from '@sagegames/react-headless';

describe('review state machine', () => {
  it('goes none → review → continued, and reset starts over', () => {
    let s = reviewReducer(initialReview, { type: 'continue' });
    expect(s).toEqual(initialReview); // nothing to continue from
    s = reviewReducer(s, { type: 'ended', reason: 'timeout' });
    expect(s).toEqual({ stage: 'review', reason: 'timeout' });
    s = reviewReducer(s, { type: 'ended', reason: 'quit' });
    expect(s.reason).toBe('timeout'); // only the first end counts
    s = reviewReducer(s, { type: 'continue' });
    expect(s.stage).toBe('continued');
    expect(reviewReducer(s, { type: 'reset' })).toEqual(initialReview);
  });

  it('keeps the verification phases behind the review until Continue', () => {
    const review = reviewReducer(initialReview, { type: 'ended', reason: 'completed' });
    for (const phase of ['submitting', 'result', 'error'] as const) expect(launcherView(phase, review, true)).toBe('review');
    expect(launcherView('playing', review, true)).toBe('playing');
    expect(launcherView('ready', review, true)).toBe('ready');
  });

  it('Continue during submitting shows submitting, then the result', () => {
    const continued = reviewReducer(reviewReducer(initialReview, { type: 'ended', reason: 'completed' }), { type: 'continue' });
    expect(launcherView('submitting', continued, true)).toBe('submitting');
    expect(launcherView('result', continued, true)).toBe('result');
  });

  it('is skipped entirely when turned off (2.2 behaviour)', () => {
    const review = reviewReducer(initialReview, { type: 'ended', reason: 'completed' });
    expect(launcherView('submitting', review, false)).toBe('submitting');
    expect(launcherView('result', review, false)).toBe('result');
  });

  it('titles and stats', () => {
    expect(reviewTitle('timeout', defaultLabels)).toBe(defaultLabels.timeUp);
    expect(reviewTitle('quit', defaultLabels)).toBe(defaultLabels.reviewQuit);
    expect(reviewTitle('completed', defaultLabels)).toBe(defaultLabels.reviewFinished);
    expect(reviewStat('game_memory_001', { matchedPairs: 3, pairCount: 6 }, defaultLabels)?.value).toBe('3/6');
    expect(reviewStat('game_word_001', { found: ['a', 'b'] }, defaultLabels)?.value).toBe('2');
    expect(reviewStat('unknown', {}, defaultLabels)).toBeNull();
  });
});

describe('word search tap vs selection', () => {
  const c = (r: number, col: number): GridCell => [r, col];
  type Ev = Parameters<typeof selectionStep>[1];
  const run = (events: Ev[], ctx: SelectionContext, start: SelectionState = emptySelection) => {
    let s = start;
    const effects: NonNullable<SelectionEffect>[] = [];
    for (const e of events) {
      const [next, effect] = selectionStep(s, e, ctx);
      s = next;
      if (effect) effects.push(effect);
    }
    return { s, effects };
  };
  const tap = (cell: GridCell): Ev[] => [
    { type: 'down', cell },
    { type: 'up', cell },
  ];
  // Cell (0,0) belongs to found word 2; nothing else is defined.
  const ctx: SelectionContext = { readOnly: false, definedWordAt: (cell) => (cell[0] === 0 && cell[1] === 0 ? 2 : null) };

  it('a tap on a found word opens its definition and dispatches nothing', () => {
    const { s, effects } = run(tap(c(0, 0)), ctx);
    expect(effects).toEqual([{ type: 'define', word: 2 }]);
    expect(s.anchor).toBeNull();
  });

  it('a tap elsewhere leaves an anchor, and a second tap commits (tap-tap)', () => {
    const first = run(tap(c(1, 1)), ctx);
    expect(first.effects).toEqual([]);
    expect(first.s.anchor).toEqual(c(1, 1));
    const second = run(tap(c(1, 4)), ctx, first.s);
    expect(second.effects).toEqual([{ type: 'commit', from: c(1, 1), to: c(1, 4) }]);
    expect(second.s.anchor).toBeNull();
  });

  it('with an anchor, a tap on a found word completes the selection instead of defining', () => {
    const first = run(tap(c(0, 3)), ctx);
    const second = run(tap(c(0, 0)), ctx, first.s);
    expect(second.effects).toEqual([{ type: 'commit', from: c(0, 3), to: c(0, 0) }]);
  });

  it('tapping the anchor again cancels', () => {
    const first = run(tap(c(2, 2)), ctx);
    const second = run(tap(c(2, 2)), ctx, first.s);
    expect(second.effects).toEqual([]);
    expect(second.s.anchor).toBeNull();
  });

  it('drags are unchanged, including drags starting on a found word', () => {
    const { effects } = run(
      [
        { type: 'down', cell: c(0, 0) },
        { type: 'move', cell: c(0, 1) },
        { type: 'move', cell: c(0, 2) },
        { type: 'up', cell: c(0, 2) },
      ],
      ctx
    );
    expect(effects).toEqual([{ type: 'commit', from: c(0, 0), to: c(0, 2) }]);
  });

  it('a drag that comes back to its start cell neither commits nor defines', () => {
    const { effects } = run(
      [
        { type: 'down', cell: c(0, 0) },
        { type: 'move', cell: c(0, 1) },
        { type: 'move', cell: c(0, 0) },
        { type: 'up', cell: c(0, 0) },
      ],
      ctx
    );
    expect(effects).toEqual([]);
  });

  it('read-only (review board): taps define, nothing ever commits', () => {
    const ro = { ...ctx, readOnly: true };
    expect(run(tap(c(0, 0)), ro).effects).toEqual([{ type: 'define', word: 2 }]);
    const drag = run(
      [
        { type: 'down', cell: c(1, 0) },
        { type: 'move', cell: c(1, 3) },
        { type: 'up', cell: c(1, 3) },
      ],
      ro
    );
    expect(drag.effects).toEqual([]);
    expect(drag.s.anchor).toBeNull();
    expect(run([...tap(c(1, 0)), ...tap(c(1, 3))], ro).effects).toEqual([]);
  });
});

describe('definedWordAt', () => {
  it('only found words with a definition count, most recently found wins', () => {
    const s: WordSearchState = wordSearchRules.init('defs', wordSearchRules.parseConfig({}));
    const cell = s.words[0].cells[0];
    const at: GridCell = [Math.floor(cell / s.size), cell % s.size];

    const unfound = s.words.map((w, i) => (i === 0 ? { ...w, found: false, definition: 'x' } : w));
    expect(definedWordAt({ ...s, words: unfound }, [], at)).toBeNull(); // unfound words give no hint

    const bare = s.words.map((w, i) => (i === 0 ? { ...w, found: true, definition: undefined } : w));
    expect(definedWordAt({ ...s, words: bare }, [0], at)).toBeNull(); // no definition

    // Two found words sharing the cell: the later one in found order wins.
    const two = s.words.map((w, i) => (i < 2 ? { ...w, found: true, definition: `d${i}`, cells: [cell, ...w.cells] } : w));
    expect(definedWordAt({ ...s, words: two }, [1, 0], at)).toBe(0);
    expect(definedWordAt({ ...s, words: two }, [0, 1], at)).toBe(1);
  });
});
