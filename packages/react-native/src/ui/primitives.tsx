import React, { ReactNode, useCallback, useState } from 'react';
import { ActivityIndicator, LayoutChangeEvent, Pressable, StyleProp, Text, TextStyle, useWindowDimensions, View, ViewStyle } from 'react-native';
import { SageTheme, useSage } from '@sagegames/react-headless';

/**
 * Width available to a game board: the measured width of the view it's laid out in (so it fits
 * modals, sheets and split screens), estimated from the window until the first layout.
 * Put `onLayout` on the view that fills the space.
 */
export function useBoardWidth(max: number, padding: number) {
  const window = useWindowDimensions();
  const [measured, setMeasured] = useState<number | null>(null);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.floor(e.nativeEvent.layout.width);
    setMeasured((prev) => (prev === w ? prev : w));
  }, []);
  const available = measured ?? window.width - padding * 2;
  return { width: Math.max(0, Math.min(available, max)), onLayout };
}

/** Text style for a theme font, falling back to fontWeight when no custom family is set. */
export function font(theme: SageTheme, weight: 'regular' | 'medium' | 'bold'): TextStyle {
  const family = theme.fonts[weight];
  if (family) return { fontFamily: family };
  return { fontWeight: weight === 'bold' ? '700' : weight === 'medium' ? '600' : '400' };
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  style,
  compact,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
  accessibilityLabel?: string;
}) {
  const { theme } = useSage();
  const c = theme.colors;
  const bg = { primary: c.primary, secondary: c.surfaceAlt, ghost: 'transparent', danger: 'transparent' }[variant];
  const fg = { primary: c.onPrimary, secondary: c.text, ghost: c.text, danger: c.danger }[variant];
  const border = variant === 'ghost' ? c.border : variant === 'danger' ? c.danger : bg;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderColor: border,
          borderWidth: 1,
          borderRadius: theme.radii.md,
          paddingVertical: compact ? 8 : 13,
          paddingHorizontal: compact ? 12 : 20,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      <Text style={[{ color: fg, fontSize: compact ? 14 : 16 }, font(theme, 'bold')]}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { theme } = useSage();
  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderWidth: 1,
          borderRadius: theme.radii.lg,
          padding: theme.spacing.lg,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Stat({ label, value, align = 'flex-start' }: { label: string; value: string | number; align?: 'flex-start' | 'center' | 'flex-end' }) {
  const { theme } = useSage();
  return (
    <View style={{ alignItems: align }}>
      <Text style={[{ color: theme.colors.textMuted, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' }, font(theme, 'medium')]}>
        {label}
      </Text>
      <Text style={[{ color: theme.colors.text, fontSize: 20, fontVariant: ['tabular-nums'] }, font(theme, 'bold')]}>{value}</Text>
    </View>
  );
}

export function ProgressBar({ fraction, color }: { fraction: number; color?: string }) {
  const { theme } = useSage();
  const pct = `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%` as const;
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.surfaceAlt, overflow: 'hidden' }}>
      <View style={{ width: pct, height: 6, backgroundColor: color ?? theme.colors.primary }} />
    </View>
  );
}

export function Loading({ label }: { label: string }) {
  const { theme } = useSage();
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl, gap: theme.spacing.md }}>
      <ActivityIndicator color={theme.colors.primary} size="large" />
      <Text style={[{ color: theme.colors.textMuted, fontSize: 15 }, font(theme, 'regular')]}>{label}</Text>
    </View>
  );
}

export function Heading({ children, size = 20 }: { children: ReactNode; size?: number }) {
  const { theme } = useSage();
  return <Text style={[{ color: theme.colors.text, fontSize: size }, font(theme, 'bold')]}>{children}</Text>;
}

export function Body({ children, muted, center, style }: { children: ReactNode; muted?: boolean; center?: boolean; style?: StyleProp<TextStyle> }) {
  const { theme } = useSage();
  return (
    <Text
      style={[
        { color: muted ? theme.colors.textMuted : theme.colors.text, fontSize: 15, lineHeight: 21, textAlign: center ? 'center' : 'left' },
        font(theme, 'regular'),
        style,
      ]}
    >
      {children}
    </Text>
  );
}
