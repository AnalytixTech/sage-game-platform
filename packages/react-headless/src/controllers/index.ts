/**
 * Interaction logic for each game, shared by the web and React Native views. Views only draw:
 * everything about selection, input and timers lives here.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSageOptional } from '../provider';
import type { MemoryMatchState } from '@sagegames/game-memory-match';
import type { QuizState } from '@sagegames/game-quiz-master';
import { isWrongEntry, SudokuState } from '@sagegames/game-sudoku';
import { areAdjacent, WordRushState } from '@sagegames/game-word-rush';
import { selectionCells, WordSearchState } from '@sagegames/game-word-search';

type Dispatch = (type: string, payload?: unknown) => void;

// ---------------------------------------------------------------- Quiz

const FEEDBACK_MS = 1400;

export function useQuiz(state: QuizState, elapsedMs: number, dispatch: Dispatch) {
  const total = state.questions.length;
  const current = state.index < total ? state.questions[state.index] : null;
  const remainingMs = current ? Math.max(0, state.limitMs - (elapsedMs - state.questionStartedAt)) : 0;

  // Feedback for the question just answered (or timed out), shown briefly over the next one.
  const lastIndex = state.answers.length - 1;
  const showFeedback = lastIndex >= 0 && (elapsedMs - state.questionStartedAt < FEEDBACK_MS || !current);
  const feedback = showFeedback
    ? (() => {
        const q = state.questions[lastIndex];
        const chosen = state.answers[lastIndex];
        return {
          correct: chosen === q.correctIndex,
          timedOut: chosen === null,
          correctAnswer: q.options[q.correctIndex],
        };
      })()
    : null;

  const answer = useCallback(
    (choice: number) => dispatch('ANSWER', { qIndex: state.index, choice }),
    [dispatch, state.index]
  );

  return {
    current,
    questionNumber: Math.min(state.index + 1, total),
    total,
    remainingMs,
    remainingFraction: state.limitMs > 0 ? remainingMs / state.limitMs : 0,
    feedback,
    answer,
  };
}

// ---------------------------------------------------------------- Memory

const MISMATCH_VISIBLE_MS = 900;

export function gridColumns(count: number): number {
  if (count <= 16) return 4;
  if (count === 20) return 5;
  return 6;
}

export function useMemoryBoard(state: MemoryMatchState, elapsedMs: number, dispatch: Dispatch) {
  // A mismatched pair stays in the state until the next flip; visually we turn it back after a moment.
  const [mismatchAt, setMismatchAt] = useState<number | null>(null);
  const lastMoves = useRef(state.moves);
  useEffect(() => {
    if (state.moves !== lastMoves.current) {
      lastMoves.current = state.moves;
      setMismatchAt(state.mismatch ? elapsedMs : null);
    }
  }, [state.moves, state.mismatch, elapsedMs]);

  const mismatchHidden = state.mismatch && mismatchAt !== null && elapsedMs - mismatchAt > MISMATCH_VISIBLE_MS;

  const isFaceUp = (i: number) =>
    state.cards[i].matched || (state.revealed.includes(i) && !mismatchHidden);
  const isMismatch = (i: number) => state.mismatch && !mismatchHidden && state.revealed.includes(i);

  return {
    columns: gridColumns(state.cards.length),
    isFaceUp,
    isMismatch,
    flip: (i: number) => dispatch('FLIP', { index: i }),
  };
}

// ---------------------------------------------------------------- Sudoku

export interface SudokuCellInfo {
  index: number;
  value: number;
  given: boolean;
  wrong: boolean;
  selected: boolean;
  peer: boolean;
  sameValue: boolean;
  notes: number[];
  /** Thick borders where the region changes (and at the grid edge). */
  borders: { top: boolean; right: boolean; bottom: boolean; left: boolean };
}

export function useSudoku(state: SudokuState, dispatch: Dispatch) {
  const { size, regions } = state;
  const firstOpen = state.givens.findIndex((g) => !g);
  const [selected, setSelected] = useState<number | null>(firstOpen >= 0 ? firstOpen : null);
  const [notesMode, setNotesMode] = useState(false);

  const peers = useMemo(() => {
    const set = new Set<number>();
    if (selected === null) return set;
    const r = Math.floor(selected / size);
    const c = selected % size;
    for (let i = 0; i < size * size; i++) {
      if (Math.floor(i / size) === r || i % size === c || regions[i] === regions[selected]) set.add(i);
    }
    return set;
  }, [selected, size, regions]);

  const selectedValue = selected !== null ? state.values[selected] : 0;

  const cell = (i: number): SudokuCellInfo => {
    const r = Math.floor(i / size);
    const c = i % size;
    const notes: number[] = [];
    for (let d = 1; d <= size; d++) if (state.notes[i] & (1 << d)) notes.push(d);
    return {
      index: i,
      value: state.values[i],
      given: state.givens[i],
      wrong: isWrongEntry(state, i),
      selected: i === selected,
      peer: peers.has(i) && i !== selected,
      sameValue: selectedValue !== 0 && state.values[i] === selectedValue && i !== selected,
      notes,
      borders: {
        top: r === 0 || regions[i - size] !== regions[i],
        bottom: r === size - 1 || regions[i + size] !== regions[i],
        left: c === 0 || regions[i - 1] !== regions[i],
        right: c === size - 1 || regions[i + 1] !== regions[i],
      },
    };
  };

  /** How many times each digit is correctly placed (a digit is "done" at `size`). */
  const digitCounts = useMemo(() => {
    const counts = new Array<number>(size + 1).fill(0);
    state.values.forEach((v, i) => v !== 0 && v === state.solution[i] && counts[v]++);
    return counts;
  }, [state.values, state.solution, size]);

  const input = (digit: number) => {
    if (selected === null || state.givens[selected]) return;
    if (notesMode && digit > 0) dispatch('NOTE', { cell: selected, value: digit });
    else dispatch('ENTER', { cell: selected, value: digit });
  };

  const move = (dr: number, dc: number) => {
    const from = selected ?? 0;
    const r = Math.min(size - 1, Math.max(0, Math.floor(from / size) + dr));
    const c = Math.min(size - 1, Math.max(0, (from % size) + dc));
    setSelected(r * size + c);
  };

  return {
    size,
    selected,
    select: setSelected,
    notesMode,
    toggleNotes: () => setNotesMode((n) => !n),
    cell,
    digitCounts,
    input,
    erase: () => selected !== null && dispatch('ERASE', { cell: selected }),
    hint: () => dispatch('HINT', selected !== null ? { cell: selected } : {}),
    move,
  };
}

// ---------------------------------------------------------------- Word search

export type GridCell = [row: number, col: number];

const same = (a: GridCell | null, b: GridCell | null) => !!a && !!b && a[0] === b[0] && a[1] === b[1];

/** Where a word selection stands, between pointer events. */
export interface SelectionState {
  /** First letter of a selection (drag start, or the first of two taps). */
  anchor: GridCell | null;
  hover: GridCell | null;
  dragging: boolean;
  /** The current press, when it started with no anchor (it may turn out to be a tap on a found word). */
  press: { cell: GridCell; moved: boolean } | null;
}

export type SelectionEffect = { type: 'commit'; from: GridCell; to: GridCell } | { type: 'define'; word: number } | null;

export interface SelectionContext {
  /** Game over (or otherwise not accepting moves): only definition taps work. */
  readOnly: boolean;
  /** The found word with a definition to show for a cell (most recently found wins), or null. */
  definedWordAt: (cell: GridCell) => number | null;
}

export const emptySelection: SelectionState = { anchor: null, hover: null, dragging: false, press: null };

/**
 * Pointer events → selection, commits and definition taps. The rule:
 * - a tap is a press and release on the same cell, with no move to another cell;
 * - a tap with no anchor on a found word (that has a definition) opens the definition, cancels
 *   any selection and dispatches nothing;
 * - with an anchor, a tap completes or cancels the selection exactly as before;
 * - drags are unchanged, including drags that start on a found word.
 */
export function selectionStep(
  s: SelectionState,
  event: { type: 'down' | 'move' | 'up'; cell: GridCell | null } | { type: 'cancel' },
  ctx: SelectionContext
): [SelectionState, SelectionEffect] {
  if (event.type === 'cancel') return [emptySelection, null];
  const cell = event.cell;

  if (event.type === 'down') {
    if (!cell) return [s, null];
    if (ctx.readOnly) return [{ ...emptySelection, press: { cell, moved: false } }, null];
    if (s.anchor && !same(s.anchor, cell)) return [emptySelection, { type: 'commit', from: s.anchor, to: cell }]; // second tap
    if (same(s.anchor, cell)) return [emptySelection, null]; // tapping the anchor again cancels
    return [{ anchor: cell, hover: cell, dragging: true, press: { cell, moved: false } }, null];
  }

  if (event.type === 'move') {
    if (!cell) return [s, null];
    const press = s.press && !same(s.press.cell, cell) ? { ...s.press, moved: true } : s.press;
    if (ctx.readOnly) return [{ ...s, press }, null];
    return [{ ...s, press, hover: s.dragging && !same(s.hover, cell) ? cell : s.hover }, null];
  }

  // up
  const press = s.press;
  if (press && !press.moved && cell && same(cell, press.cell)) {
    const word = ctx.definedWordAt(cell);
    if (word !== null) return [emptySelection, { type: 'define', word }];
  }
  if (ctx.readOnly) return [emptySelection, null];
  const next: SelectionState = { ...s, dragging: false, press: null };
  if (s.dragging && s.anchor && cell && !same(s.anchor, cell)) return [emptySelection, { type: 'commit', from: s.anchor, to: cell }];
  return [next, null]; // a plain tap leaves the anchor for tap-tap selection
}

/** The found word (with a definition) to show for a cell: the most recently found one. */
export function definedWordAt(state: WordSearchState, foundOrder: number[], cell: GridCell): number | null {
  const idx = cell[0] * state.size + cell[1];
  for (let k = foundOrder.length - 1; k >= 0; k--) {
    const w = state.words[foundOrder[k]];
    if (w?.found && w.definition && w.cells.includes(idx)) return foundOrder[k];
  }
  return null;
}

export interface WordDefinitionInfo {
  index: number;
  word: string;
  definition: string;
  note?: string;
}

/**
 * Selection by drag (press on the first letter, release on the last) or by two taps
 * (tap the first letter, then the last). Tapping a found word shows its definition.
 * Pass `readOnly` once the game is over so only definition taps work.
 */
export function useWordSearch(state: WordSearchState, dispatch: Dispatch, options: { readOnly?: boolean } = {}) {
  const sage = useSageOptional();
  const [, render] = useState(0);
  const sel = useRef<SelectionState>(emptySelection);
  const [definition, setDefinition] = useState<WordDefinitionInfo | null>(null);

  // Order words were found in, so a cell shared by two found words shows the latest.
  const order = useRef<number[]>(state.words.map((w, i) => (w.found ? i : -1)).filter((i) => i >= 0));
  state.words.forEach((w, i) => {
    if (w.found && !order.current.includes(i)) order.current.push(i);
  });

  const show = useCallback(
    (index: number) => {
      const w = state.words[index];
      if (!w?.found || !w.definition) return; // unfound words and words without a definition open nothing
      setDefinition({ index, word: w.display, definition: w.definition, ...(w.note ? { note: w.note } : {}) });
      sage?.onWordDefinition?.({ gameId: 'game_word_search_001', word: w.display });
    },
    [state.words, sage]
  );

  const step = (event: Parameters<typeof selectionStep>[1]) => {
    const [next, effect] = selectionStep(sel.current, event, {
      readOnly: !!options.readOnly,
      definedWordAt: (cell) => definedWordAt(state, order.current, cell),
    });
    const changed = next.anchor !== sel.current.anchor || next.hover !== sel.current.hover;
    sel.current = next;
    if (effect?.type === 'commit') dispatch('SELECT', { from: effect.from, to: effect.to });
    if (effect?.type === 'define') show(effect.word);
    if (changed || effect) render((n) => n + 1);
  };

  const { anchor, hover } = sel.current;
  const preview = useMemo(() => {
    if (!anchor) return new Set<number>();
    const cells = hover ? selectionCells(state.size, anchor, hover) : null;
    return new Set(cells ?? [anchor[0] * state.size + anchor[1]]);
  }, [anchor, hover, state.size]);

  /** Found words by cell index → index of the word (for colouring). */
  const foundCells = useMemo(() => {
    const map = new Map<number, number>();
    state.words.forEach((w, wi) => w.found && w.cells.forEach((c) => map.set(c, wi)));
    return map;
  }, [state.words]);

  return {
    size: state.size,
    anchor,
    preview,
    foundCells,
    pointerDown: (cell: GridCell) => step({ type: 'down', cell }),
    pointerMove: (cell: GridCell) => step({ type: 'move', cell }),
    pointerUp: (cell: GridCell | null) => step({ type: 'up', cell }),
    cancel: () => step({ type: 'cancel' }),
    /** The definition open right now, if any. */
    definition,
    /** Open a found word's definition (e.g. from its chip). */
    showDefinition: show,
    closeDefinition: () => setDefinition(null),
    /** Whether a word's chip opens a definition. */
    canDefine: (index: number) => !!state.words[index]?.found && !!state.words[index]?.definition,
    /** Whether any found word has a definition (to show the hint). */
    hasDefinitions: state.words.some((w) => w.found && !!w.definition),
  };
}

// ---------------------------------------------------------------- Word rush

export function useWordRush(state: WordRushState, elapsedMs: number, dispatch: Dispatch) {
  const [path, setPathState] = useState<number[]>([]);
  // Kept in a ref too, so a drag that ends right after its last move submits the latest path.
  const pathRef = useRef<number[]>([]);
  const setPath = (next: number[]) => {
    pathRef.current = next;
    setPathState(next);
  };

  /** Tap to build a word: adjacent tiles extend it, the last tile undoes, an earlier tile rewinds. */
  const tap = (i: number) => {
    const p = pathRef.current;
    const at = p.indexOf(i);
    // (at >= 0 first: on an empty path indexOf and length - 1 are both -1.)
    if (at >= 0 && at === p.length - 1) return setPath(p.slice(0, -1));
    if (at >= 0) return setPath(p.slice(0, at + 1));
    if (p.length === 0 || areAdjacent(state.size, p[p.length - 1], i)) return setPath([...p, i]);
    setPath([i]); // not touching: start a new word here
  };

  /** Dragging: start on a tile, then extend through adjacent tiles (backtracking one tile undoes it). */
  const beginPath = (i: number) => setPath([i]);
  const extendTo = (i: number) => {
    const p = pathRef.current;
    if (p.length >= 2 && p[p.length - 2] === i) return setPath(p.slice(0, -1));
    if (p.length && !p.includes(i) && areAdjacent(state.size, p[p.length - 1], i)) setPath([...p, i]);
  };

  const wordOf = (p: number[]) => p.map((i) => state.grid[i]).join('');
  const submit = () => {
    const p = pathRef.current;
    if (wordOf(p).length >= 3) dispatch('SUBMIT', { path: p });
    setPath([]);
  };

  const word = wordOf(path);
  return {
    size: state.size,
    path,
    word,
    canSubmit: word.length >= 3,
    tap,
    beginPath,
    extendTo,
    clear: () => setPath([]),
    submit,
    remainingMs: Math.max(0, state.durationMs - elapsedMs),
  };
}

// ---------------------------------------------------------------- Formatting

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
