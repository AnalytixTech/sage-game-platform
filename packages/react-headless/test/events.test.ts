import { describe, expect, it } from 'vitest';
import { memoryMatchRules, MemoryMatchState } from '@sagegames/game-memory-match';
import { quizMasterRules } from '@sagegames/game-quiz-master';
import { sudokuRules, SudokuState } from '@sagegames/game-sudoku';
import { wordRushRules } from '@sagegames/game-word-rush';
import { wordSearchRules } from '@sagegames/game-word-search';
import { memoryEvents, quizEvents, sudokuEvents, sudokuUnitsOf, wordRushEvents, wordSearchEvents } from '@sagegames/react-headless';

const pairsOf = (s: MemoryMatchState) => {
  const m = new Map<string, number[]>();
  s.cards.forEach((c, i) => m.set(c.face, [...(m.get(c.face) ?? []), i]));
  return [...m.values()];
};

describe('memory events', () => {
  const config = memoryMatchRules.parseConfig({ pairCount: 2 });
  const flip = (s: MemoryMatchState, index: number) => memoryMatchRules.reduce(s, { type: 'FLIP', payload: { index } }, 0);

  it('reports matches, misses and completion', () => {
    const s0 = memoryMatchRules.init('ev', config);
    const [[a, b], [c, d]] = pairsOf(s0);
    const s1 = flip(s0, a);
    expect(memoryEvents(s0, s1)).toEqual([]); // first card of a pair: nothing yet
    const s2 = flip(s1, c);
    expect(memoryEvents(s1, s2)).toEqual([{ kind: 'miss', cells: [a, c] }]);
    const s3 = flip(flip(s2, a), b);
    expect(memoryEvents(flip(s2, a), s3)).toEqual([{ kind: 'match', cells: [a, b].sort((x, y) => x - y), points: s3.score - s2.score }]);
    const s4 = flip(flip(s3, c), d);
    expect(memoryEvents(flip(s3, c), s4)).toMatchObject([{ kind: 'match', cells: [c, d].sort((x, y) => x - y) }, { kind: 'complete' }]);
  });
});

describe('quiz events', () => {
  it('reports correct answers with points and streak, wrong answers and timeouts', () => {
    const s0 = quizMasterRules.init('ev', quizMasterRules.parseConfig({ questionCount: 3 }));
    const right = s0.questions[0].correctIndex;
    const s1 = quizMasterRules.reduce(s0, { type: 'ANSWER', payload: { qIndex: 0, choice: right } }, 1000);
    expect(quizEvents(s0, s1)).toEqual([{ kind: 'correct', question: 0, points: s1.score, streak: 1 }]);
    const wrong = (s1.questions[1].correctIndex + 1) % s1.questions[1].options.length;
    const s2 = quizMasterRules.reduce(s1, { type: 'ANSWER', payload: { qIndex: 1, choice: wrong } }, 2000);
    expect(quizEvents(s1, s2)).toEqual([{ kind: 'wrong', question: 1 }]);
    const s3 = quizMasterRules.advance(s2, 2000 + s2.limitMs);
    expect(quizEvents(s2, s3)).toEqual([{ kind: 'timeout', question: 2 }, { kind: 'complete' }]);
  });
});

describe('sudoku events', () => {
  const s0 = sudokuRules.init('ev', sudokuRules.parseConfig({ variant: '4x4' }));
  const enter = (s: SudokuState, cell: number, value: number) => sudokuRules.reduce(s, { type: 'ENTER', payload: { cell, value } }, 0);
  const open = s0.givens.map((g, i) => (g ? -1 : i)).filter((i) => i >= 0);

  it('reports placements and mistakes', () => {
    const cell = open[0];
    expect(sudokuEvents(s0, enter(s0, cell, s0.solution[cell]))).toContainEqual({ kind: 'placed', cell });
    const wrong = (s0.solution[cell] % 4) + 1;
    expect(sudokuEvents(s0, enter(s0, cell, wrong))).toEqual([{ kind: 'mistake', cell }]);
  });

  it('reports a unit the moment it is completed, and the finished puzzle', () => {
    let s = s0;
    const all: string[] = [];
    for (const cell of open) {
      const next = enter(s, cell, s.solution[cell]);
      all.push(...sudokuEvents(s, next).map((e) => e.kind));
      s = next;
    }
    // 4 rows + 4 columns + 4 boxes on a 4x4 (units with givens only complete when their last cell is filled).
    expect(all.filter((k) => k === 'unitComplete').length).toBe(12);
    expect(all.filter((k) => k === 'complete')).toHaveLength(1);
  });

  it('sudokuUnitsOf gives the row, column and region of a cell', () => {
    const [row, col, region] = sudokuUnitsOf(s0, 5); // row 1, col 1 on a 4x4
    expect(row).toEqual([4, 5, 6, 7]);
    expect(col).toEqual([1, 5, 9, 13]);
    expect(region).toContain(5);
    expect(region).toHaveLength(4);
  });
});

describe('word search events', () => {
  it('reports found words with their cells and points, and misses', () => {
    const s0 = wordSearchRules.init('ev', wordSearchRules.parseConfig({ words: [{ token: 'VISA' }, { token: 'CAMPUS' }], wordSelectionMode: 'custom_only' }));
    const w = s0.words[0];
    const at = (i: number): [number, number] => [Math.floor(i / s0.size), i % s0.size];
    const s1 = wordSearchRules.reduce(s0, { type: 'SELECT', payload: { from: at(w.cells[0]), to: at(w.cells[w.cells.length - 1]) } }, 1000);
    expect(wordSearchEvents(s0, s1)).toEqual([{ kind: 'wordFound', word: 0, cells: w.cells, points: s1.score - s0.score }]);
    const s2 = wordSearchRules.reduce(s1, { type: 'SELECT', payload: { from: [0, 0], to: [0, 1] } }, 2000);
    if (s2.invalidSelections > s1.invalidSelections) expect(wordSearchEvents(s1, s2)).toEqual([{ kind: 'noWord' }]);
  });
});

describe('word rush events', () => {
  it('reports scored and rejected words', () => {
    const s0 = wordRushRules.init('ev', wordRushRules.parseConfig({}));
    const s1 = wordRushRules.reduce(s0, { type: 'SUBMIT', payload: { path: [0, 5, 10] } }, 1000);
    const [event] = wordRushEvents(s0, s1);
    expect(['wordScored', 'wordRejected']).toContain(event.kind);
    expect(wordRushEvents(s1, s1)).toEqual([]);
  });
});
