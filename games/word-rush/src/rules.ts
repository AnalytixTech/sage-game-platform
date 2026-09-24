import { GameRules, RulesAction, WordGameResult } from '@sagegames/types';
import { asConfigRecord, createRng, isNonNegativeInt, isRecord, readInt } from '@sagegames/engine';
import { DICE_4X4, DICE_5X5 } from './dice';
import { isDictionaryWord } from './dictionary';

export const WORD_RUSH_GAME_ID = 'game_word_001';

export interface WordRushRulesConfig {
  /** Grid is size x size (4 or 5). */
  size: number;
  durationSeconds: number;
}

export type WordRushRejection = 'not_adjacent' | 'too_short' | 'not_a_word' | 'already_found';

export interface WordRushState {
  size: number;
  /** Row-major tile faces; "QU" is a single tile. */
  grid: string[];
  found: string[];
  /** Feedback for the most recent submission, for the UI. */
  last: { word: string; points: number; rejected?: WordRushRejection } | null;
  score: number;
  bonusPoints: number;
  longestWord: string;
  invalidAttempts: number;
  durationMs: number;
  elapsedMs: number;
  timeUp: boolean;
}

export type WordRushAction = RulesAction<'SUBMIT', { path: number[] }>;

const MIN_WORD_LENGTH = 3;

/** Points by word length (8+ letters score the maximum). */
export function wordPoints(length: number): number {
  if (length < MIN_WORD_LENGTH) return 0;
  return [100, 150, 250, 400, 600][length - 3] ?? 1000;
}

export function areAdjacent(size: number, a: number, b: number): boolean {
  const dr = Math.abs(Math.floor(a / size) - Math.floor(b / size));
  const dc = Math.abs((a % size) - (b % size));
  return a !== b && dr <= 1 && dc <= 1;
}

export function wordForPath(state: Pick<WordRushState, 'size' | 'grid'>, path: readonly number[]): string | null {
  const cells = state.size * state.size;
  const seen = new Set<number>();
  for (let i = 0; i < path.length; i++) {
    const idx = path[i];
    if (idx >= cells || seen.has(idx)) return null;
    if (i > 0 && !areAdjacent(state.size, path[i - 1], idx)) return null;
    seen.add(idx);
  }
  return path.map((idx) => state.grid[idx]).join('').toLowerCase();
}

export const wordRushRules: GameRules<WordRushRulesConfig, WordRushState, WordRushAction, WordGameResult> = {
  gameId: WORD_RUSH_GAME_ID,
  rulesVersion: 1,

  parseConfig(input) {
    const config = asConfigRecord(input);
    return {
      size: readInt(config, 'size', 4, 4, 5),
      durationSeconds: readInt(config, 'durationSeconds', 90, 30, 300),
    };
  },

  init(seed, config) {
    const rng = createRng(seed).fork('word-rush');
    const dice = rng.shuffle(config.size === 5 ? DICE_5X5 : DICE_4X4);
    const grid = dice.map((die) => {
      const face = die[rng.int(die.length)];
      return face === 'Q' ? 'QU' : face;
    });

    return {
      size: config.size,
      grid,
      found: [],
      last: null,
      score: 0,
      bonusPoints: 0,
      longestWord: '',
      invalidAttempts: 0,
      durationMs: config.durationSeconds * 1000,
      elapsedMs: 0,
      timeUp: false,
    };
  },

  parseAction(type, payload) {
    if (type !== 'SUBMIT' || !isRecord(payload) || !Array.isArray(payload.path)) return null;
    const path = payload.path;
    if (path.length < 2 || path.length > 25 || !path.every(isNonNegativeInt)) return null;
    return { type: 'SUBMIT', payload: { path: path.slice() } };
  },

  advance(state, tMs) {
    if (tMs <= state.elapsedMs) return state;
    return { ...state, elapsedMs: tMs, timeUp: state.timeUp || tMs >= state.durationMs };
  },

  reduce(state, action) {
    const word = wordForPath(state, action.payload.path);
    const reject = (rejected: WordRushRejection, text: string): WordRushState => ({
      ...state,
      last: { word: text, points: 0, rejected },
      invalidAttempts: state.invalidAttempts + (rejected === 'already_found' ? 0 : 1),
    });

    if (word === null) return reject('not_adjacent', '');
    if (word.length < MIN_WORD_LENGTH) return reject('too_short', word);
    if (state.found.includes(word)) return reject('already_found', word);
    if (!isDictionaryWord(word)) return reject('not_a_word', word);

    const points = wordPoints(word.length);
    return {
      ...state,
      found: [...state.found, word],
      last: { word, points },
      score: state.score + points,
      bonusPoints: state.bonusPoints + Math.max(0, points - wordPoints(4)),
      longestWord: word.length > state.longestWord.length ? word : state.longestWord,
    };
  },

  isOver: (state) => state.timeUp,
  score: (state) => state.score,
  progress: (state) => Math.min(1, state.elapsedMs / state.durationMs),

  result: (state) => ({
    wordsFound: state.found.length,
    longestWord: state.longestWord,
    bonusPoints: state.bonusPoints,
    invalidAttempts: state.invalidAttempts,
  }),

  limits: {
    maxActions: 600,
    maxDurationMs: (config) => config.durationSeconds * 1000,
    minActionIntervalMs: 400,
    // Pausing would stop the clock while the grid stays visible.
    allowPause: false,
  },

  race: { ranking: 'score_then_time' },
};
