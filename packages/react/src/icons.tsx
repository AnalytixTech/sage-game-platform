import React, { CSSProperties } from 'react';
import { useSage } from '@sagegames/react-headless';

/** Stroke icons (24×24, 2px strokes) plus a few emoji where colour is the point. */
const PATHS: Record<string, string> = {
  play: 'M7 4.5v15l12.5-7.5z',
  pause: 'M8 5v14M16 5v14',
  close: 'M6 6l12 12M18 6L6 18',
  cross: 'M6 6l12 12M18 6L6 18',
  check: 'M4.5 12.5l5 5L19.5 7',
  star: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.8z',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  erase: 'M20 6H9l-5 6 5 6h11a1 1 0 001-1V7a1 1 0 00-1-1zM12.5 9.5l5 5M17.5 9.5l-5 5',
  pencil: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  users: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5M16 4.5a3.5 3.5 0 010 6.5M18 14.8c2 .7 3.2 2.4 3.5 5.2',
  bolt: 'M13 2.5L4.5 13.5H12l-1 8 8.5-11H12z',
  back: 'M15 5l-7 7 7 7',
  sparkle: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18',
};

const EMOJI: Record<string, string> = { trophy: '🏆', bulb: '💡', fire: '🔥', medal1: '🥇', medal2: '🥈', medal3: '🥉' };

export type IconName = keyof typeof PATHS | keyof typeof EMOJI;

export function Icon({ name, size = 18, color, style }: { name: IconName; size?: number; color?: string; style?: CSSProperties }) {
  const { theme } = useSage();
  if (EMOJI[name]) {
    return (
      <span aria-hidden style={{ fontSize: size, lineHeight: 1, display: 'inline-block', ...style }}>
        {EMOJI[name]}
      </span>
    );
  }
  const filled = name === 'play' || name === 'star' || name === 'bolt';
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? color ?? theme.colors.text : 'none'}
      stroke={color ?? theme.colors.text}
      strokeWidth={filled ? 1.2 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block', flex: 'none', ...style }}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
