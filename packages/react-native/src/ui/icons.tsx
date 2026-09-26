import React from 'react';
import { StyleProp, Text, TextStyle } from 'react-native';
import { useSage } from '@sagegames/react-headless';

/**
 * A small icon set drawn with text glyphs (no SVG dependency). Emoji-style icons (trophy, bulb,
 * fire) keep their own colours; the rest take `color`.
 */
export const ICONS = {
  play: '▶',
  pause: '❚❚',
  close: '✕',
  check: '✓',
  cross: '✕',
  star: '★',
  clock: '◷',
  trophy: '🏆',
  bulb: '💡',
  erase: '⌫',
  pencil: '✎',
  users: '👥',
  fire: '🔥',
  bolt: '⚡',
  back: '‹',
  medal1: '🥇',
  medal2: '🥈',
  medal3: '🥉',
  sparkle: '✦',
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 18, color, style }: { name: IconName; size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  const { theme } = useSage();
  // Glyphs sit a little high in most fonts; the pause bars look better slightly narrower.
  const tweak = name === 'pause' ? { letterSpacing: -2, fontSize: size * 0.8 } : null;
  return (
    <Text
      accessible={false}
      importantForAccessibility="no"
      style={[{ fontSize: size, lineHeight: Math.round(size * 1.15), color: color ?? theme.colors.text, textAlign: 'center' }, tweak, style]}
    >
      {ICONS[name]}
    </Text>
  );
}
