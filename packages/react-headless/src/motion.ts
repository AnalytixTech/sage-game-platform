import { useCallback } from 'react';
import { emitFeedback, FeedbackKind } from './feedback';
import { useSage } from './provider';
import { motionMs, SageTheme } from './theme';

export interface MotionSettings {
  /** No animation at all (OS setting, provider `reduceMotion`, or theme motion.scale = 0). */
  reduced: boolean;
  /** Confetti and victory effects. */
  celebrations: boolean;
  /** Duration in ms for a token, already scaled (0 when reduced). */
  ms: (key: keyof SageTheme['motion']['durations']) => number;
  spring: SageTheme['motion']['spring'];
}

/**
 * Motion settings for views. The UI packages pass the OS "reduce motion" setting (React Native's
 * AccessibilityInfo, the browser's prefers-reduced-motion); the provider's `reduceMotion` prop wins.
 */
export function useMotionSettings(osReduced: boolean): MotionSettings {
  const { theme, reduceMotion } = useSage();
  const reduced = reduceMotion ?? (osReduced || theme.motion.scale <= 0);
  return {
    reduced,
    celebrations: !reduced && theme.motion.celebrations,
    ms: (key) => motionMs(theme, key, reduced),
    spring: theme.motion.spring,
  };
}

/** Play haptics/sound for a moment through the provider's `feedback` adapter (no-op without one). */
export function useFeedback(): (kind: FeedbackKind) => void {
  const { feedback } = useSage();
  return useCallback((kind: FeedbackKind) => emitFeedback(feedback, kind), [feedback]);
}
