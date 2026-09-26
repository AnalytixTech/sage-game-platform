/**
 * The post-game review: when a game ends, the finished board stays on screen with a Continue
 * button while the result is verified in the background. Pure state machine, shared by
 * GameLauncher and MatchLauncher on both platforms. It only changes what is shown; submission
 * starts exactly as before.
 */
import type { SageLabels } from './labels';

export type EndReason = 'completed' | 'quit' | 'timeout';

export interface ReviewState {
  /** none: no game has ended since the last reset; review: showing the board; continued: the player moved on. */
  stage: 'none' | 'review' | 'continued';
  reason: EndReason | null;
}

export type ReviewEvent = { type: 'ended'; reason: EndReason } | { type: 'continue' } | { type: 'reset' };

export const initialReview: ReviewState = { stage: 'none', reason: null };

export function reviewReducer(state: ReviewState, event: ReviewEvent): ReviewState {
  switch (event.type) {
    case 'ended':
      // Only the first end counts (a late timer can't restart the review).
      return state.stage === 'none' ? { stage: 'review', reason: event.reason } : state;
    case 'continue':
      return state.stage === 'review' ? { ...state, stage: 'continued' } : state;
    case 'reset':
      return initialReview;
  }
}

export type ReviewablePhase = 'loading' | 'ready' | 'playing' | 'submitting' | 'result' | 'error';
export type LauncherView = ReviewablePhase | 'review';

/**
 * What GameLauncher shows. While reviewing, the verification phases (submitting, result and a
 * submit error) stay behind the review; after Continue the real phase shows (so Continue during
 * submitting shows "Checking your score…" and then the result).
 */
export function launcherView(phase: ReviewablePhase, review: ReviewState, enabled: boolean): LauncherView {
  if (enabled && review.stage === 'review' && (phase === 'submitting' || phase === 'result' || phase === 'error')) return 'review';
  return phase;
}

/** The one stat worth showing next to the score on the review, per game. */
export function reviewStat(gameId: string, state: unknown, labels: SageLabels): { label: string; value: string } | null {
  const s = state as Record<string, unknown>;
  const len = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  switch (gameId) {
    case 'game_quiz_001':
      return { label: labels.correct.replace(/!$/, ''), value: `${s.correctAnswers ?? 0}/${len(s.questions)}` };
    case 'game_memory_001':
      return { label: labels.pairs, value: `${s.matchedPairs ?? 0}/${s.pairCount ?? 0}` };
    case 'game_sudoku_001':
      return { label: labels.mistakes, value: String(s.mistakes ?? 0) };
    case 'game_word_search_001':
      return { label: labels.found, value: `${s.foundCount ?? 0}/${len(s.words)}` };
    case 'game_word_001':
      return { label: labels.words, value: String(len(s.found)) };
    default:
      return null;
  }
}

/** Heading for the review, by how the game ended. */
export function reviewTitle(reason: EndReason | null, labels: SageLabels): string {
  return reason === 'timeout' ? labels.timeUp : reason === 'quit' ? labels.reviewQuit : labels.reviewFinished;
}
