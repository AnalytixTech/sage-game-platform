import { GameRules, RulesAction, WordSearchEntry, WordSearchResult, WordSelectionMode } from '@sagegames/types';
import {
  asConfigRecord,
  ConfigError,
  createRng,
  isNonNegativeInt,
  isRecord,
  readEnum,
  readInt,
  readString,
} from '@sagegames/engine';

export const WORD_SEARCH_GAME_ID = 'game_word_search_001';

export const MIN_GRID_SIZE = 6;
export const MAX_GRID_SIZE = 15;
const MAX_WORDS = 30;
const PLACEMENT_ATTEMPTS = 300;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export type WordSearchDifficulty = 'easy' | 'medium' | 'hard';

export const DEFAULT_WORDS: WordSearchEntry[] = [
  { token: 'SAGE', display: 'Sage', definition: 'Wise person or platform' },
  { token: 'GAME', display: 'Game', definition: 'An activity played for entertainment' },
  { token: 'PUZZLE', display: 'Puzzle', definition: 'A game designed to test ingenuity' },
  { token: 'PLATFORM', display: 'Platform', definition: 'A framework for running applications' },
  { token: 'WORD', display: 'Word', definition: 'A single distinct meaningful element of speech' },
  { token: 'SEARCH', display: 'Search', definition: 'To look carefully to find something' },
  { token: 'SOLVER', display: 'Solver', definition: 'Someone or something that resolves puzzles' },
  { token: 'RUSH', display: 'Rush', definition: 'To move or act with urgent speed' },
];

/** The single normalisation used for both placing and matching words. */
export function normalizeToken(token: string): string {
  return token.toUpperCase().replace(/[^A-Z]/g, '');
}

export interface WordSearchRulesConfig {
  categoryName: string;
  words: WordSearchEntry[];
  gridSize: number;
  difficulty: WordSearchDifficulty;
}

export interface PlacedWord {
  token: string;
  display: string;
  definition?: string;
  note?: string;
  /** Flattened cell indices (row * size + col) in reading order. */
  cells: number[];
  found: boolean;
}

export interface WordSearchState {
  categoryName: string;
  size: number;
  /** Row-major letters. */
  grid: string[][];
  words: PlacedWord[];
  skippedWords: string[];
  foundCount: number;
  invalidSelections: number;
  score: number;
  elapsedMs: number;
  completedAtMs: number | null;
}

export type WordSearchAction = RulesAction<'SELECT', { from: [number, number]; to: [number, number] }>;

const DIRECTIONS: Record<WordSearchDifficulty, [number, number][]> = {
  easy: [
    [0, 1],
    [1, 0],
  ],
  medium: [
    [0, 1],
    [1, 0],
    [1, 1],
    [-1, 1],
  ],
  hard: [
    [0, 1],
    [1, 0],
    [1, 1],
    [-1, 1],
    [0, -1],
    [-1, 0],
    [-1, -1],
    [1, -1],
  ],
};

function parseEntries(raw: unknown): WordSearchEntry[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) throw new ConfigError('config.words must be an array');
  return raw.slice(0, MAX_WORDS * 2).map((entry, i) => {
    if (!isRecord(entry) || typeof entry.token !== 'string') {
      throw new ConfigError(`config.words[${i}].token must be a string`);
    }
    const text = (key: string) => (typeof entry[key] === 'string' ? (entry[key] as string).slice(0, 200) : undefined);
    return {
      token: entry.token.slice(0, 40),
      display: text('display') ?? entry.token.slice(0, 40),
      definition: text('definition'),
      note: text('note'),
    };
  });
}

function selectWords(
  mode: WordSelectionMode | undefined,
  includeDefaultWords: unknown,
  custom: WordSearchEntry[] | undefined
): WordSearchEntry[] {
  const hasCustom = !!custom && custom.length > 0;
  let resolved = mode;
  if (!resolved) {
    if (includeDefaultWords === true && hasCustom) resolved = 'combine';
    else if (hasCustom) resolved = 'custom_only';
    else resolved = 'default_only';
  }

  if (resolved === 'custom_only') return hasCustom ? custom! : DEFAULT_WORDS;
  if (resolved === 'default_only') return DEFAULT_WORDS;
  return [...DEFAULT_WORDS, ...(custom ?? [])];
}

export const wordSearchRules: GameRules<WordSearchRulesConfig, WordSearchState, WordSearchAction, WordSearchResult> = {
  gameId: WORD_SEARCH_GAME_ID,
  rulesVersion: 1,

  parseConfig(input) {
    const config = asConfigRecord(input);
    const difficulty = readEnum(config, 'difficulty', ['easy', 'medium', 'hard'] as const, 'medium');
    const defaultSize = difficulty === 'hard' ? 14 : difficulty === 'easy' ? 10 : 12;
    const mode =
      config.wordSelectionMode === undefined
        ? undefined
        : readEnum(config, 'wordSelectionMode', ['custom_only', 'default_only', 'combine'] as const, 'combine');

    // Later entries override earlier ones with the same normalised token (custom beats default).
    const byToken = new Map<string, WordSearchEntry>();
    selectWords(mode, config.includeDefaultWords, parseEntries(config.words)).forEach((entry) => {
      const token = normalizeToken(entry.token);
      if (token.length >= 2) byToken.set(token, entry);
    });

    return {
      categoryName: readString(config, 'categoryName', 'General Knowledge', 60),
      words: Array.from(byToken.values()).slice(0, MAX_WORDS),
      gridSize: readInt(config, 'gridSize', defaultSize, MIN_GRID_SIZE, MAX_GRID_SIZE),
      difficulty,
    };
  },

  init(seed, config) {
    const rng = createRng(seed).fork('word-search');
    const entries = config.words.map((entry) => ({ entry, token: normalizeToken(entry.token) }));
    const longest = entries.reduce((max, e) => (e.token.length <= MAX_GRID_SIZE ? Math.max(max, e.token.length) : max), 0);
    // Grow the grid to fit the longest word instead of silently dropping it.
    const size = Math.min(Math.max(config.gridSize, longest, MIN_GRID_SIZE), MAX_GRID_SIZE);

    const grid: string[] = new Array(size * size).fill('');
    const directions = DIRECTIONS[config.difficulty];
    const words: PlacedWord[] = [];
    const skippedWords: string[] = [];

    // Place longer words first; they are the hardest to fit.
    const ordered = entries
      .map((e, i) => ({ ...e, i }))
      .sort((a, b) => b.token.length - a.token.length || a.i - b.i);

    for (const { entry, token } of ordered) {
      if (token.length > size) {
        skippedWords.push(entry.display);
        continue;
      }

      let cells: number[] | null = null;
      for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS && !cells; attempt++) {
        const [dr, dc] = rng.pick(directions);
        const r0 = rng.int(size);
        const c0 = rng.int(size);
        const r1 = r0 + dr * (token.length - 1);
        const c1 = c0 + dc * (token.length - 1);
        if (r1 < 0 || r1 >= size || c1 < 0 || c1 >= size) continue;

        const candidate: number[] = [];
        for (let k = 0; k < token.length; k++) {
          const idx = (r0 + dr * k) * size + (c0 + dc * k);
          if (grid[idx] !== '' && grid[idx] !== token[k]) break;
          candidate.push(idx);
        }
        if (candidate.length === token.length) cells = candidate;
      }

      if (!cells) {
        skippedWords.push(entry.display);
        continue;
      }

      cells.forEach((idx, k) => (grid[idx] = token[k]));
      words.push({
        token,
        display: entry.display,
        definition: entry.definition,
        note: entry.note,
        cells,
        found: false,
      });
    }

    for (let i = 0; i < grid.length; i++) {
      if (grid[i] === '') grid[i] = ALPHABET[rng.int(ALPHABET.length)];
    }

    // Keep the configured order for the word list shown to the player.
    const order = new Map(entries.map((e, i) => [e.token, i]));
    words.sort((a, b) => (order.get(a.token) ?? 0) - (order.get(b.token) ?? 0));

    return {
      categoryName: config.categoryName,
      size,
      grid: Array.from({ length: size }, (_, r) => grid.slice(r * size, (r + 1) * size)),
      words,
      skippedWords,
      foundCount: 0,
      invalidSelections: 0,
      score: 0,
      elapsedMs: 0,
      completedAtMs: null,
    };
  },

  parseAction(type, payload) {
    if (type !== 'SELECT' || !isRecord(payload)) return null;
    const { from, to } = payload;
    const isCell = (v: unknown): v is [number, number] =>
      Array.isArray(v) && v.length === 2 && isNonNegativeInt(v[0]) && isNonNegativeInt(v[1]);
    if (!isCell(from) || !isCell(to)) return null;
    return { type: 'SELECT', payload: { from: [from[0], from[1]], to: [to[0], to[1]] } };
  },

  advance(state, tMs) {
    return tMs > state.elapsedMs ? { ...state, elapsedMs: tMs } : state;
  },

  reduce(state, action, tMs) {
    const cells = selectionCells(state.size, action.payload.from, action.payload.to);
    const invalid = { ...state, invalidSelections: state.invalidSelections + 1, score: state.score - 10 };
    if (!cells || cells.length < 2) return invalid;

    const letters = cells.map((idx) => state.grid[Math.floor(idx / state.size)][idx % state.size]).join('');
    const reversed = letters.split('').reverse().join('');
    const wordIndex = state.words.findIndex((w) => !w.found && (w.token === letters || w.token === reversed));
    if (wordIndex === -1) return invalid;

    const words = state.words.slice();
    const word = words[wordIndex];
    // Accept the word wherever the player found it; highlight the cells they actually selected.
    words[wordIndex] = { ...word, found: true, cells: word.token === letters ? cells : cells.slice().reverse() };

    const foundCount = state.foundCount + 1;
    const complete = foundCount === words.length;
    return {
      ...state,
      words,
      foundCount,
      score: state.score + word.token.length * 100 + (complete ? 500 : 0),
      completedAtMs: complete ? tMs : state.completedAtMs,
    };
  },

  isOver: (state) => state.foundCount === state.words.length,
  // The running total may dip below zero; only the final score is floored.
  score: (state) => Math.max(0, state.score),
  progress: (state) => (state.words.length === 0 ? 1 : state.foundCount / state.words.length),

  result: (state) => ({
    wordsFound: state.foundCount,
    totalWords: state.words.length,
    accuracy: state.words.length > 0 ? (state.foundCount / state.words.length) * 100 : 0,
    completedInSeconds: Math.floor((state.completedAtMs ?? state.elapsedMs) / 1000),
    categoryName: state.categoryName,
    skippedWords: state.skippedWords,
  }),

  limits: {
    maxActions: 600,
    maxDurationMs: () => 30 * 60 * 1000,
    minActionIntervalMs: 300,
    allowPause: true,
  },

  race: { ranking: 'time_then_score' },
};

/** Cells on the straight line from `from` to `to` (horizontal, vertical or diagonal), or null. */
export function selectionCells(size: number, from: [number, number], to: [number, number]): number[] | null {
  const [r0, c0] = from;
  const [r1, c1] = to;
  if (r0 >= size || c0 >= size || r1 >= size || c1 >= size) return null;
  const dr = Math.sign(r1 - r0);
  const dc = Math.sign(c1 - c0);
  const steps = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0));
  if (r0 !== r1 && c0 !== c1 && Math.abs(r1 - r0) !== Math.abs(c1 - c0)) return null;
  return Array.from({ length: steps + 1 }, (_, k) => (r0 + dr * k) * size + (c0 + dc * k));
}
