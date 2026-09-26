/**
 * Haptics and sounds. The SDK ships no native modules: the host passes an adapter, e.g.
 *
 *   import * as Haptics from 'expo-haptics';
 *   <SageGameProvider feedback={expoHapticsFeedback(Haptics)} … />
 *
 * Game views call `useFeedback()` at meaningful moments; with no adapter nothing happens.
 */

export type FeedbackKind =
  /** Light tick: selecting a tile, flipping a card, a countdown second. */
  | 'tap'
  /** Something good: pair matched, word found, correct answer. */
  | 'success'
  /** A miss that isn't an error: mismatched pair, timed-out question. */
  | 'warning'
  /** Rejected: invalid word, wrong answer, wrong digit. */
  | 'error'
  /** Game won or a big moment (row completed, streak). */
  | 'celebrate';

export interface FeedbackAdapter {
  haptic?(kind: FeedbackKind): void;
  sound?(kind: FeedbackKind): void;
}

/** The subset of expo-haptics this uses (so the SDK doesn't depend on it). */
export interface ExpoHapticsLike {
  selectionAsync(): Promise<void>;
  impactAsync(style: unknown): Promise<void>;
  notificationAsync(type: unknown): Promise<void>;
  ImpactFeedbackStyle: { Light: unknown; Medium: unknown; Heavy: unknown };
  NotificationFeedbackType: { Success: unknown; Warning: unknown; Error: unknown };
}

/** Map feedback kinds onto expo-haptics. */
export function expoHapticsFeedback(h: ExpoHapticsLike): FeedbackAdapter {
  return {
    haptic(kind) {
      const run = (): Promise<void> => {
        switch (kind) {
          case 'tap':
            return h.selectionAsync();
          case 'success':
            return h.notificationAsync(h.NotificationFeedbackType.Success);
          case 'warning':
            return h.notificationAsync(h.NotificationFeedbackType.Warning);
          case 'error':
            return h.notificationAsync(h.NotificationFeedbackType.Error);
          case 'celebrate':
            return h.impactAsync(h.ImpactFeedbackStyle.Heavy);
        }
      };
      run().catch(() => undefined);
    },
  };
}

/** Vibration patterns for the browser's navigator.vibrate (where supported). */
export function webVibrationFeedback(): FeedbackAdapter {
  const patterns: Record<FeedbackKind, number | number[]> = { tap: 8, success: [12, 40, 18], warning: 30, error: [30, 40, 30], celebrate: [20, 50, 20, 50, 40] };
  return {
    haptic(kind) {
      const nav = (globalThis as { navigator?: { vibrate?: (p: number | number[]) => boolean } }).navigator;
      nav?.vibrate?.(patterns[kind]);
    },
  };
}

/** Run an adapter safely: a failing host adapter must never break the game. */
export function emitFeedback(adapter: FeedbackAdapter | undefined, kind: FeedbackKind): void {
  if (!adapter) return;
  try {
    adapter.haptic?.(kind);
  } catch {
    /* ignore */
  }
  try {
    adapter.sound?.(kind);
  } catch {
    /* ignore */
  }
}
