/**
 * Slots let a host replace a piece of the SageGames UI everywhere it appears (every Button, the
 * intro card, the result hero…) or restyle it without replacing it.
 *
 *   <SageGameProvider
 *     components={{ Button: MyButton, LeaderboardRow: MyRow }}
 *     slotStyles={{ card: { borderRadius: 4 }, chip: { borderWidth: 0 } }}
 *   />
 *
 * Slot props are the same on web and React Native (buttons get `onPress` on both).
 */
import { ComponentType, ReactNode } from 'react';
import { useSage } from './provider';

export interface ButtonSlotProps {
  label: string;
  onPress: () => void;
  variant: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  compact?: boolean;
  /** Icon name from the SDK's icon set (play, check, clock…). */
  icon?: string;
  accessibilityLabel?: string;
}

export interface IntroCardSlotProps {
  gameId: string;
  title: string;
  instructions: string;
  /** Timed games can't be paused. */
  timed: boolean;
  onPlay: () => void;
}

export interface ResultHeroSlotProps {
  gameId?: string;
  title: string;
  score: number;
  rank: number | null;
  durationMs: number;
  /** Counts on leaderboards. */
  valid: boolean;
}

export interface LeaderboardRowSlotProps {
  rank: number;
  name: string;
  score: number;
  isYou: boolean;
  /** Position in the list (for staggered animation). */
  index: number;
}

export interface CountdownSlotProps {
  /** Seconds left, or null for "Go!". */
  value: number | null;
  /** Before a timed solo game, or before a battle. */
  kind: 'getReady' | 'battle';
}

export interface SlotComponents {
  Button: ComponentType<ButtonSlotProps>;
  IntroCard: ComponentType<IntroCardSlotProps>;
  ResultHero: ComponentType<ResultHeroSlotProps>;
  LeaderboardRow: ComponentType<LeaderboardRowSlotProps>;
  Countdown: ComponentType<CountdownSlotProps>;
}

/**
 * Named parts that accept extra styles (React Native style objects, or CSS properties on the web).
 * They're applied after the SDK's own styles.
 */
export type SlotStyleName =
  | 'button'
  | 'card'
  | 'chip'
  | 'header'
  | 'intro'
  | 'resultHero'
  | 'leaderboardRow'
  | 'lobbyRow'
  | 'countdown'
  | 'gameBoard';

export type SlotStyles = Partial<Record<SlotStyleName, unknown>>;

/** The host's replacement for a slot, if any. */
export function useSlot<K extends keyof SlotComponents>(name: K): SlotComponents[K] | undefined {
  return useSage().components?.[name];
}

/** Extra styles for a named part (cast to the platform's style type by the UI package). */
export function useSlotStyle<T = unknown>(name: SlotStyleName): T | undefined {
  return useSage().slotStyles?.[name] as T | undefined;
}

/** A render override that also receives the default element, so it can wrap instead of rebuild. */
export type RenderOverride<TInfo> = (info: TInfo, defaultElement: ReactNode) => ReactNode;
