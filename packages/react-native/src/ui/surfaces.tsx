import React, { ReactNode } from 'react';
import { Platform, StyleProp, Text, TextStyle, View, ViewStyle } from 'react-native';
import { alpha, isHex, SageTheme, TypeToken, useSage, useSlotStyle } from '@sagegames/react-headless';

/**
 * Shadows and gradients: React Native 0.76+ (and react-native-web) draw CSS-style `boxShadow`
 * and gradients; older versions get the legacy shadow props and a flat colour.
 */
const version = (Platform.constants as { reactNativeVersion?: { major: number; minor: number } } | undefined)?.reactNativeVersion;
const MODERN = Platform.OS === 'web' || !version || version.major > 0 || version.minor >= 76;

type Level = 'none' | 'sm' | 'md' | 'lg';

const rgba = (color: string, opacity: number) => (isHex(color) ? alpha(color, opacity) : color);

export function shadowStyle(theme: SageTheme, level: Level): ViewStyle {
  if (level === 'none') return {};
  const s = theme.elevation[level];
  if (MODERN) return { boxShadow: `0px ${s.offsetY}px ${s.radius}px ${rgba(s.color, s.opacity)}` } as ViewStyle;
  return {
    shadowColor: s.color,
    shadowOpacity: s.opacity,
    shadowRadius: s.radius / 2,
    shadowOffset: { width: 0, height: s.offsetY },
    elevation: s.elevation,
  };
}

/** A two-stop gradient background; the first stop is the fallback colour. */
export function gradientStyle(stops: readonly [string, string] | string[], angle = 135): ViewStyle {
  const [from, to] = stops;
  if (!MODERN || from === to) return { backgroundColor: from };
  const css = `linear-gradient(${angle}deg, ${from}, ${to})`;
  return (Platform.OS === 'web' ? { backgroundColor: from, backgroundImage: css } : { backgroundColor: from, experimental_backgroundImage: css }) as ViewStyle;
}

/** Text style for a typography token. */
export function typeStyle(theme: SageTheme, token: TypeToken): TextStyle {
  const family = theme.fonts[token.weight];
  return {
    fontSize: token.size,
    letterSpacing: token.letterSpacing,
    lineHeight: Math.round(token.size * token.lineHeight),
    ...(family ? { fontFamily: family } : { fontWeight: token.weight === 'bold' ? '700' : token.weight === 'medium' ? '600' : '400' }),
  };
}

export interface SurfaceProps {
  children?: ReactNode;
  elevation?: Level;
  /** Fill with one of the theme's gradients. */
  gradient?: keyof SageTheme['gradients'] | [string, string];
  radius?: keyof SageTheme['radii'];
  padded?: boolean;
  border?: boolean;
  tone?: 'surface' | 'alt' | 'raised';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** A card: surface colour (or gradient), border, radius and shadow from the theme. */
export function Surface({ children, elevation = 'md', gradient, radius = 'lg', padded = true, border = true, tone = 'surface', style, testID }: SurfaceProps) {
  const { theme } = useSage();
  const slotStyle = useSlotStyle<StyleProp<ViewStyle>>('card');
  const c = theme.colors;
  const fill = gradient
    ? gradientStyle(typeof gradient === 'string' ? theme.gradients[gradient] : gradient)
    : { backgroundColor: tone === 'alt' ? c.surfaceAlt : tone === 'raised' ? c.surfaceRaised : c.surface };
  return (
    <View
      testID={testID}
      style={[
        fill,
        shadowStyle(theme, elevation),
        {
          borderRadius: theme.radii[radius],
          borderWidth: border && !gradient ? 1 : 0,
          borderColor: c.border,
          padding: padded ? (theme.density === 'compact' ? theme.spacing.md : theme.spacing.lg) : 0,
        },
        slotStyle,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export type Tone = 'neutral' | 'primary' | 'success' | 'danger' | 'warning' | 'accent';

/** A small rounded label: "Verified", "×3 streak", "Battle". */
export function Chip({ label, tone = 'neutral', icon, color, style }: { label: string; tone?: Tone; icon?: ReactNode; color?: string; style?: StyleProp<ViewStyle> }) {
  const { theme } = useSage();
  const slotStyle = useSlotStyle<StyleProp<ViewStyle>>('chip');
  const c = theme.colors;
  const fg = color ?? { neutral: c.textMuted, primary: c.primary, success: c.success, danger: c.danger, warning: c.warning, accent: c.primaryAlt }[tone];
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          alignSelf: 'flex-start',
          paddingVertical: 4,
          paddingHorizontal: 10,
          borderRadius: theme.radii.pill,
          backgroundColor: rgba(isHex(fg) ? fg : c.primary, 0.14),
          borderWidth: 1,
          borderColor: rgba(isHex(fg) ? fg : c.primary, 0.35),
        },
        slotStyle,
        style,
      ]}
    >
      {icon}
      <Text style={[typeStyle(theme, theme.typography.caption), { color: fg }]}>{label}</Text>
    </View>
  );
}

/** A round count or rank badge. */
export function Badge({ children, color, textColor, size = 28 }: { children: ReactNode; color?: string; textColor?: string; size?: number }) {
  const { theme } = useSage();
  return (
    <View style={{ minWidth: size, height: size, paddingHorizontal: 6, borderRadius: size / 2, backgroundColor: color ?? theme.colors.primary, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={[typeStyle(theme, theme.typography.caption), { color: textColor ?? theme.colors.onPrimary, fontSize: size * 0.46, letterSpacing: 0 }]}>{children}</Text>
    </View>
  );
}

/** Coloured initials, for players without a picture. */
export function Avatar({ name, size = 36, color }: { name: string; size?: number; color?: string }) {
  const { theme } = useSage();
  const initials = name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?';
  const palette = Object.values(theme.colors.gameAccents);
  const bg = color ?? palette[[...name].reduce((h, ch) => h + ch.charCodeAt(0), 0) % palette.length];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={[typeStyle(theme, theme.typography.caption), { color: '#ffffff', fontSize: size * 0.38, letterSpacing: 0 }]}>{initials}</Text>
    </View>
  );
}
