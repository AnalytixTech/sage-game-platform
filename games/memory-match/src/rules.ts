import { GameRules, MemoryGameResult, RulesAction } from '@sagegames/types';
import { asConfigRecord, createRng, isNonNegativeInt, isRecord, readInt } from '@sagegames/engine';

export const MEMORY_MATCH_GAME_ID = 'game_memory_001';

const FACES = ['🐶', '🐱', '🦊', '🐻', '🐼', '🐯', '🦁', '🐮', '🐸', '🐵', '🐙', '🦉'];

export interface MemoryMatchConfig {
  pairCount: number;
}

export interface MemoryCard {
  face: string;
  matched: boolean;
  /** Part of a pair that was revealed and missed before. */
  missed: boolean;
}

export interface MemoryMatchState {
  cards: MemoryCard[];
  pairCount: number;
  /** Indices currently face up and not yet matched (0, 1 or 2 cards). */
  revealed: number[];
  /** Two revealed cards that did not match; they stay visible until the next flip. */
  mismatch: boolean;
  moves: number;
  matchedPairs: number;
  misses: number;
  /** Pairs matched without either card having been part of a missed attempt. */
  flawlessMatches: number;
  score: number;
  elapsedMs: number;
}

export type MemoryMatchAction = RulesAction<'FLIP', { index: number }>;

const POINTS_PER_PAIR = 100;
const FLAWLESS_BONUS = 50;
const MISS_PENALTY = 5;

export const memoryMatchRules: GameRules<MemoryMatchConfig, MemoryMatchState, MemoryMatchAction, MemoryGameResult> = {
  gameId: MEMORY_MATCH_GAME_ID,
  rulesVersion: 1,

  parseConfig(input) {
    const config = asConfigRecord(input);
    return { pairCount: readInt(config, 'pairCount', 6, 2, FACES.length) };
  },

  init(seed, config) {
    const rng = createRng(seed).fork('deck');
    const faces = rng.shuffle(FACES).slice(0, config.pairCount);
    const deck = rng.shuffle([...faces, ...faces]);
    return {
      cards: deck.map((face) => ({ face, matched: false, missed: false })),
      pairCount: config.pairCount,
      revealed: [],
      mismatch: false,
      moves: 0,
      matchedPairs: 0,
      misses: 0,
      flawlessMatches: 0,
      score: 0,
      elapsedMs: 0,
    };
  },

  parseAction(type, payload) {
    if (type !== 'FLIP' || !isRecord(payload) || !isNonNegativeInt(payload.index)) return null;
    return { type: 'FLIP', payload: { index: payload.index } };
  },

  advance(state, tMs) {
    return tMs > state.elapsedMs ? { ...state, elapsedMs: tMs } : state;
  },

  reduce(state, action) {
    const { index } = action.payload;
    const card = state.cards[index];
    if (!card || card.matched) return state;

    // A mismatched pair stays visible until the next flip, which hides it first.
    let revealed = state.mismatch ? [] : state.revealed;
    if (revealed.includes(index)) return state;

    revealed = [...revealed, index];
    if (revealed.length < 2) {
      return { ...state, revealed, mismatch: false };
    }

    const [first, second] = revealed;
    const cards = state.cards.slice();
    const moves = state.moves + 1;

    if (cards[first].face === cards[second].face) {
      const flawless = !cards[first].missed && !cards[second].missed;
      cards[first] = { ...cards[first], matched: true };
      cards[second] = { ...cards[second], matched: true };
      return {
        ...state,
        cards,
        revealed: [],
        mismatch: false,
        moves,
        matchedPairs: state.matchedPairs + 1,
        flawlessMatches: state.flawlessMatches + (flawless ? 1 : 0),
        score: state.score + POINTS_PER_PAIR + (flawless ? FLAWLESS_BONUS : 0),
      };
    }

    // Only penalise a miss when one of the cards had been seen before (a memory lapse).
    const lapse = cards[first].missed || cards[second].missed;
    cards[first] = { ...cards[first], missed: true };
    cards[second] = { ...cards[second], missed: true };
    return {
      ...state,
      cards,
      revealed,
      mismatch: true,
      moves,
      misses: state.misses + 1,
      score: state.score - (lapse ? MISS_PENALTY : 0),
    };
  },

  isOver: (state) => state.matchedPairs === state.pairCount,
  // The running total may dip below zero; only the final score is floored, so early mistakes still count.
  score: (state) => Math.max(0, state.score),
  progress: (state) => state.matchedPairs / state.pairCount,

  result: (state) => ({
    totalMoves: state.moves,
    matchedPairs: state.matchedPairs,
    flawlessMatches: state.flawlessMatches,
  }),

  limits: {
    maxActions: 400,
    maxDurationMs: () => 30 * 60 * 1000,
    minActionIntervalMs: 150,
    allowPause: true,
  },

  race: { ranking: 'time_then_score' },
};
