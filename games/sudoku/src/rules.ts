import { GameRules, RulesAction, SudokuResult, SudokuVariantId } from '@sagegames/types';
import { asConfigRecord, createRng, isNonNegativeInt, isRecord, readEnum, readInt } from '@sagegames/engine';
import { generatePuzzle } from './solver';
import { regionsFor, VARIANT_CONFIGS, VARIANT_IDS } from './variants';

export const SUDOKU_GAME_ID = 'game_sudoku_001';

export type SudokuDifficulty = 'easy' | 'medium' | 'hard';

export interface SudokuRulesConfig {
  variant: SudokuVariantId;
  difficulty: SudokuDifficulty;
  /** 0 means no time limit. */
  timeLimitSeconds: number;
}

/** All per-cell arrays are flattened row-major (index = row * size + col). */
export interface SudokuState {
  variant: SudokuVariantId;
  variantName: string;
  size: number;
  difficulty: SudokuDifficulty;
  regions: number[];
  givens: boolean[];
  values: number[];
  solution: number[];
  /** Pencil marks as bitmasks (bit d set = note d). */
  notes: number[];
  /** Cell already earned its points (or was filled by a hint), so it can never score again. */
  credited: boolean[];
  moves: number;
  mistakes: number;
  hintsUsed: number;
  score: number;
  completed: boolean;
  timedOut: boolean;
  timeLimitMs: number;
  elapsedMs: number;
  completedAtMs: number | null;
}

export type SudokuAction =
  | RulesAction<'ENTER', { cell: number; value: number }>
  | RulesAction<'NOTE', { cell: number; value: number }>
  | RulesAction<'ERASE', { cell: number }>
  | RulesAction<'HINT', { cell?: number }>;

const CELL_POINTS = 25;
const MISTAKE_PENALTY = 50;
const HINT_PENALTY = 100;
const COMPLETION_BONUS = 500;

const isSolved = (values: readonly number[], solution: readonly number[]) =>
  values.every((v, i) => v === solution[i]);

function withCompletion(state: SudokuState, tMs: number): SudokuState {
  if (state.completed || !isSolved(state.values, state.solution)) return state;
  return { ...state, completed: true, completedAtMs: tMs, score: state.score + COMPLETION_BONUS };
}

export function isWrongEntry(state: SudokuState, cell: number): boolean {
  return state.values[cell] !== 0 && state.values[cell] !== state.solution[cell];
}

export const sudokuRules: GameRules<SudokuRulesConfig, SudokuState, SudokuAction, SudokuResult> = {
  gameId: SUDOKU_GAME_ID,
  rulesVersion: 1,

  parseConfig(input) {
    const config = asConfigRecord(input);
    const timeLimitSeconds = readInt(config, 'timeLimitSeconds', 0, 0, 7200);
    return {
      variant: readEnum(config, 'variant', VARIANT_IDS, '9x9'),
      difficulty: readEnum(config, 'difficulty', ['easy', 'medium', 'hard'] as const, 'medium'),
      timeLimitSeconds: timeLimitSeconds > 0 ? Math.max(60, timeLimitSeconds) : 0,
    };
  },

  init(seed, config) {
    const variant = VARIANT_CONFIGS[config.variant];
    const regions = regionsFor(variant);
    const { puzzle, solution } = generatePuzzle(
      variant.size,
      regions,
      config.difficulty,
      createRng(seed).fork('sudoku')
    );
    const cells = puzzle.length;

    return {
      variant: variant.id,
      variantName: variant.name,
      size: variant.size,
      difficulty: config.difficulty,
      regions,
      givens: puzzle.map((v) => v !== 0),
      values: puzzle,
      solution,
      notes: new Array<number>(cells).fill(0),
      credited: puzzle.map((v) => v !== 0),
      moves: 0,
      mistakes: 0,
      hintsUsed: 0,
      score: 0,
      completed: false,
      timedOut: false,
      timeLimitMs: config.timeLimitSeconds * 1000,
      elapsedMs: 0,
      completedAtMs: null,
    };
  },

  parseAction(type, payload) {
    if (!isRecord(payload)) return null;
    const { cell, value } = payload;
    switch (type) {
      case 'ENTER':
      case 'NOTE':
        if (!isNonNegativeInt(cell) || !isNonNegativeInt(value)) return null;
        return { type, payload: { cell, value } };
      case 'ERASE':
        if (!isNonNegativeInt(cell)) return null;
        return { type, payload: { cell } };
      case 'HINT':
        if (cell !== undefined && !isNonNegativeInt(cell)) return null;
        return { type, payload: cell === undefined ? {} : { cell } };
      default:
        return null;
    }
  },

  advance(state, tMs) {
    if (tMs <= state.elapsedMs) return state;
    const timedOut = !state.completed && state.timeLimitMs > 0 && tMs >= state.timeLimitMs;
    return { ...state, elapsedMs: tMs, timedOut: state.timedOut || timedOut };
  },

  reduce(state, action, tMs) {
    const cells = state.values.length;

    switch (action.type) {
      case 'ENTER': {
        const { cell, value } = action.payload;
        if (cell >= cells || value > state.size || state.givens[cell]) return state;
        if (value === state.values[cell]) return state;

        const values = state.values.slice();
        const notes = state.notes.slice();
        values[cell] = value;
        notes[cell] = 0;

        // Entering 0 clears the cell; it is neither a move nor a mistake.
        if (value === 0) return { ...state, values, notes };

        const next: SudokuState = { ...state, values, notes, moves: state.moves + 1 };
        if (value === state.solution[cell]) {
          if (!state.credited[cell]) {
            const credited = state.credited.slice();
            credited[cell] = true;
            next.credited = credited;
            next.score = state.score + CELL_POINTS;
          }
        } else {
          next.mistakes = state.mistakes + 1;
          next.score = state.score - MISTAKE_PENALTY;
        }
        return withCompletion(next, tMs);
      }

      case 'NOTE': {
        const { cell, value } = action.payload;
        if (cell >= cells || value < 1 || value > state.size) return state;
        if (state.givens[cell] || state.values[cell] !== 0) return state;
        const notes = state.notes.slice();
        notes[cell] ^= 1 << value;
        return { ...state, notes };
      }

      case 'ERASE': {
        const { cell } = action.payload;
        if (cell >= cells || state.givens[cell]) return state;
        if (state.values[cell] === 0 && state.notes[cell] === 0) return state;
        const values = state.values.slice();
        const notes = state.notes.slice();
        values[cell] = 0;
        notes[cell] = 0;
        return { ...state, values, notes };
      }

      case 'HINT': {
        const needsHint = (i: number) => !state.givens[i] && state.values[i] !== state.solution[i];
        const requested = action.payload.cell;
        let target = requested !== undefined && requested < cells && needsHint(requested) ? requested : -1;
        if (target === -1) target = state.values.findIndex((_, i) => needsHint(i));
        if (target === -1) return state; // nothing left to hint: free

        const values = state.values.slice();
        const notes = state.notes.slice();
        const credited = state.credited.slice();
        values[target] = state.solution[target];
        notes[target] = 0;
        credited[target] = true;
        return withCompletion(
          {
            ...state,
            values,
            notes,
            credited,
            hintsUsed: state.hintsUsed + 1,
            score: state.score - HINT_PENALTY,
          },
          tMs
        );
      }
    }
  },

  isOver: (state) => state.completed || state.timedOut,
  // The running total may dip below zero; only the final score is floored, so early mistakes still count.
  score: (state) => Math.max(0, state.score),

  progress(state) {
    let open = 0;
    let solved = 0;
    state.givens.forEach((given, i) => {
      if (given) return;
      open++;
      if (state.values[i] === state.solution[i]) solved++;
    });
    return open === 0 ? 1 : solved / open;
  },

  result: (state) => ({
    variant: state.variant,
    movesCount: state.moves,
    mistakesCount: state.mistakes,
    hintsUsed: state.hintsUsed,
    completedInSeconds: Math.floor((state.completedAtMs ?? state.elapsedMs) / 1000),
    solved: state.completed,
  }),

  limits: {
    maxActions: 3000,
    maxDurationMs: (config) => (config.timeLimitSeconds > 0 ? config.timeLimitSeconds * 1000 : 2 * 3600 * 1000),
    minActionIntervalMs: 120,
    allowPause: true,
  },

  race: { ranking: 'time_then_score' },
};
