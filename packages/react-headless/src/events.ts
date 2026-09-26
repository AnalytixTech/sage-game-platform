/**
 * Game moments worth animating (a pair matched, a word found, a row completed), worked out by
 * comparing two successive states. Pure functions, shared by the web and React Native views, so
 * both animate the same moments. They only read state, so they never affect scoring or replay.
 */
import { useEffect, useRef, useState } from 'react';
import type { MemoryMatchState } from '@sagegames/game-memory-match';
import type { QuizState } from '@sagegames/game-quiz-master';
import type { SudokuState } from '@sagegames/game-sudoku';
import type { WordRushState } from '@sagegames/game-word-rush';
import type { WordSearchState } from '@sagegames/game-word-search';
import { emitFeedback, FeedbackKind } from './feedback';
import { useSage } from './provider';

export type GameEvent =
  // Memory
  | { kind: 'match'; cells: number[]; points: number }
  | { kind: 'miss'; cells: number[] }
  // Quiz
  | { kind: 'correct'; question: number; points: number; streak: number }
  | { kind: 'wrong'; question: number }
  | { kind: 'timeout'; question: number }
  // Sudoku
  | { kind: 'placed'; cell: number }
  | { kind: 'mistake'; cell: number }
  | { kind: 'hint'; cell: number }
  | { kind: 'unitComplete'; cells: number[] }
  // Word search
  | { kind: 'wordFound'; word: number; cells: number[]; points: number }
  | { kind: 'noWord' }
  // Word rush
  | { kind: 'wordScored'; word: string; points: number }
  | { kind: 'wordRejected'; word: string; reason: string }
  // Any game
  | { kind: 'complete' };

export type EventDetector<S> = (prev: S, next: S) => GameEvent[];

// ---------------------------------------------------------------- Memory

export const memoryEvents: EventDetector<MemoryMatchState> = (prev, next) => {
  if (next.moves === prev.moves) return [];
  const events: GameEvent[] = [];
  const newlyMatched = next.cards.map((c, i) => (c.matched && !prev.cards[i]?.matched ? i : -1)).filter((i) => i >= 0);
  if (newlyMatched.length) events.push({ kind: 'match', cells: newlyMatched, points: next.score - prev.score });
  else if (next.mismatch) events.push({ kind: 'miss', cells: next.revealed.slice() });
  if (next.matchedPairs === next.pairCount && prev.matchedPairs < prev.pairCount) events.push({ kind: 'complete' });
  return events;
};

// ---------------------------------------------------------------- Quiz

export const quizEvents: EventDetector<QuizState> = (prev, next) => {
  const events: GameEvent[] = [];
  for (let q = prev.answers.length; q < next.answers.length; q++) {
    const chosen = next.answers[q];
    if (chosen === null) events.push({ kind: 'timeout', question: q });
    else if (chosen === next.questions[q]?.correctIndex) {
      // Points and streak are only known for the latest answer.
      const latest = q === next.answers.length - 1;
      events.push({ kind: 'correct', question: q, points: latest ? next.score - prev.score : 0, streak: latest ? next.streak : 0 });
    } else events.push({ kind: 'wrong', question: q });
  }
  if (next.index >= next.questions.length && prev.index < prev.questions.length) events.push({ kind: 'complete' });
  return events;
};

// ---------------------------------------------------------------- Sudoku

/** Every row, column and region (as cell lists) that contains `cell`. */
export function sudokuUnitsOf(state: Pick<SudokuState, 'size' | 'regions'>, cell: number): number[][] {
  const { size, regions } = state;
  const r = Math.floor(cell / size);
  const c = cell % size;
  const all = Array.from({ length: size * size }, (_, i) => i);
  return [
    all.filter((i) => Math.floor(i / size) === r),
    all.filter((i) => i % size === c),
    all.filter((i) => regions[i] === regions[cell]),
  ];
}

const unitSolved = (s: SudokuState, unit: number[]) => unit.every((i) => s.values[i] !== 0 && s.values[i] === s.solution[i]);

export const sudokuEvents: EventDetector<SudokuState> = (prev, next) => {
  const events: GameEvent[] = [];
  const changed = next.values.map((v, i) => (v !== prev.values[i] ? i : -1)).filter((i) => i >= 0);
  const hinted = next.hintsUsed > prev.hintsUsed;
  for (const cell of changed) {
    if (next.values[cell] === 0) continue; // erased
    if (hinted) events.push({ kind: 'hint', cell });
    else if (next.values[cell] === next.solution[cell]) events.push({ kind: 'placed', cell });
    else events.push({ kind: 'mistake', cell });
  }
  const seen = new Set<string>();
  for (const cell of changed) {
    for (const unit of sudokuUnitsOf(next, cell)) {
      const key = unit.join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      if (unitSolved(next, unit) && !unitSolved(prev, unit)) events.push({ kind: 'unitComplete', cells: unit });
    }
  }
  if (next.completed && !prev.completed) events.push({ kind: 'complete' });
  return events;
};

// ---------------------------------------------------------------- Word search

export const wordSearchEvents: EventDetector<WordSearchState> = (prev, next) => {
  const events: GameEvent[] = [];
  next.words.forEach((w, i) => {
    if (w.found && !prev.words[i]?.found) events.push({ kind: 'wordFound', word: i, cells: w.cells.slice(), points: next.score - prev.score });
  });
  if (!events.length && next.invalidSelections > prev.invalidSelections) events.push({ kind: 'noWord' });
  if (next.foundCount === next.words.length && prev.foundCount < prev.words.length) events.push({ kind: 'complete' });
  return events;
};

// ---------------------------------------------------------------- Word rush

export const wordRushEvents: EventDetector<WordRushState> = (prev, next) => {
  const last = next.last;
  if (!last || last === prev.last) return [];
  return [last.rejected ? { kind: 'wordRejected', word: last.word, reason: last.rejected } : { kind: 'wordScored', word: last.word, points: last.points }];
};

// ---------------------------------------------------------------- hook

/** Feedback for each moment (the host's haptics/sounds adapter decides what to do with it). */
export const FEEDBACK_FOR: Record<GameEvent['kind'], FeedbackKind> = {
  match: 'success',
  miss: 'warning',
  correct: 'success',
  wrong: 'error',
  timeout: 'warning',
  placed: 'tap',
  mistake: 'error',
  hint: 'tap',
  unitComplete: 'celebrate',
  wordFound: 'success',
  noWord: 'error',
  wordScored: 'success',
  wordRejected: 'error',
  complete: 'celebrate',
};

export interface GameEventsState {
  /** Events from the latest state change (empty when nothing notable happened). */
  events: GameEvent[];
  /** Increases with every batch, so views can key animations on it. */
  seq: number;
}

/**
 * Watch a game's state and report its moments. Also plays the matching feedback (haptics/sound)
 * through the provider's `feedback` adapter.
 */
export function useGameEvents<S>(state: S, detect: EventDetector<S>): GameEventsState {
  const { feedback } = useSage();
  const prev = useRef(state);
  const [out, setOut] = useState<GameEventsState>({ events: [], seq: 0 });
  useEffect(() => {
    if (prev.current === state) return;
    const events = detect(prev.current, state);
    prev.current = state;
    if (!events.length) return;
    // One feedback per batch: the most significant one.
    const order: FeedbackKind[] = ['celebrate', 'error', 'success', 'warning', 'tap'];
    const kinds = events.map((e) => FEEDBACK_FOR[e.kind]);
    emitFeedback(feedback, order.find((k) => kinds.includes(k))!);
    setOut((o) => ({ events, seq: o.seq + 1 }));
  }, [state, detect, feedback]);
  return out;
}

/** The event of a kind in the latest batch, if any. */
export function findEvent<K extends GameEvent['kind']>(events: GameEvent[], kind: K): Extract<GameEvent, { kind: K }> | undefined {
  return events.find((e) => e.kind === kind) as Extract<GameEvent, { kind: K }> | undefined;
}
