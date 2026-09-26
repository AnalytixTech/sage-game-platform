import React, { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, LayoutChangeEvent, Pressable, StyleProp, Text, TextStyle, useWindowDimensions, View, ViewStyle } from 'react-native';
import { SageTheme, touchTarget, useSage, useSlot, useSlotStyle } from '@sagegames/react-headless';
import { Icon, IconName } from './icons';
import { FadeSlide, Pop, Pulse, useMotion, usePressScale } from './motion';
import { gradientStyle, shadowStyle, Surface, SurfaceProps, typeStyle } from './surfaces';

export * from './surfaces';
export * from './icons';
export * from './motion';

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
  loading,
  style,
  compact,
  icon,
  accessibilityLabel,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  /** Shows a spinner and ignores presses. */
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
  icon?: IconName;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const { theme } = useSage();
  const Custom = useSlot('Button');
  const slotStyle = useSlotStyle<StyleProp<ViewStyle>>('button');
  const press = usePressScale();
  if (Custom) {
    return (
      <View style={style}>
        <Custom label={label} onPress={onPress} variant={variant} disabled={disabled} loading={loading} compact={compact} icon={icon} accessibilityLabel={accessibilityLabel} />
      </View>
    );
  }
  const c = theme.colors;
  const fg = { primary: c.onPrimary, secondary: c.text, ghost: c.text, danger: c.danger }[variant];
  const fill: ViewStyle =
    variant === 'primary'
      ? { ...gradientStyle(theme.gradients.primary), ...shadowStyle(theme, 'sm') }
      : { backgroundColor: variant === 'secondary' ? c.surfaceAlt : 'transparent', borderWidth: 1, borderColor: variant === 'danger' ? c.danger : c.border };
  const inactive = disabled || loading;
  const minHeight = compact ? 40 : touchTarget(theme) + 4;
  return (
    <Animated.View style={[press.style, { opacity: disabled ? 0.45 : 1 }, style]}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled: !!inactive, busy: !!loading }}
        onPress={onPress}
        disabled={inactive}
        {...press.handlers}
        style={[
          fill,
          {
            minHeight,
            borderRadius: theme.radii.md,
            paddingHorizontal: compact ? 14 : 22,
            flexDirection: 'row',
            gap: 8,
            alignItems: 'center',
            justifyContent: 'center',
          },
          slotStyle,
        ]}
      >
        {loading ? <ActivityIndicator color={fg} size="small" /> : icon ? <Icon name={icon} size={compact ? 14 : 16} color={fg} /> : null}
        <Text style={[{ color: fg, fontSize: compact ? 14 : 16, letterSpacing: 0.2 }, font(theme, 'bold')]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

/** Round icon-only button (pause, close). */
export function IconButton({ icon, onPress, label, disabled }: { icon: IconName; onPress: () => void; label: string; disabled?: boolean }) {
  const { theme } = useSage();
  const press = usePressScale(0.9);
  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        disabled={disabled}
        hitSlop={6}
        {...press.handlers}
        style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border }}
      >
        <Icon name={icon} size={15} color={theme.colors.text} />
      </Pressable>
    </Animated.View>
  );
}

/** A themed card (see Surface for elevation and gradients). */
export function Card({
  children,
  style,
  elevation = 'md',
  gradient,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  elevation?: SurfaceProps['elevation'];
  gradient?: SurfaceProps['gradient'];
}) {
  return (
    <Surface style={style} elevation={elevation} gradient={gradient}>
      {children}
    </Surface>
  );
}

export function Stat({ label, value, align = 'flex-start', icon }: { label: string; value: string | number; align?: 'flex-start' | 'center' | 'flex-end'; icon?: IconName }) {
  const { theme } = useSage();
  return (
    <View style={{ alignItems: align }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {icon && <Icon name={icon} size={11} color={theme.colors.textMuted} />}
        <Text style={[typeStyle(theme, theme.typography.caption), { color: theme.colors.textMuted, textTransform: 'uppercase' }]}>{label}</Text>
      </View>
      <Pop trigger={value}>
        <Text style={[typeStyle(theme, theme.typography.numeric), { color: theme.colors.text, fontVariant: ['tabular-nums'] }]}>{value}</Text>
      </Pop>
    </View>
  );
}

/** Animated bar; uses the primary gradient unless given a colour. */
export function ProgressBar({ fraction, color, height = 8 }: { fraction: number; color?: string; height?: number }) {
  const { theme } = useSage();
  const motion = useMotion();
  const target = Math.min(1, Math.max(0, fraction));
  const width = useRef(new Animated.Value(target)).current;
  const { reduced } = motion;
  const fast = motion.ms('fast');
  useEffect(() => {
    if (reduced) width.setValue(target);
    else Animated.timing(width, { toValue: target, duration: fast, useNativeDriver: false }).start();
  }, [target, reduced, fast, width]);
  const fill = color ? { backgroundColor: color } : gradientStyle(theme.gradients.primary, 90);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(target * 100) }}
      style={{ height, borderRadius: height / 2, backgroundColor: theme.colors.surfaceAlt, overflow: 'hidden' }}
    >
      <Animated.View style={[fill, { height, borderRadius: height / 2, width: width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
    </View>
  );
}

export function Loading({ label }: { label: string }) {
  const { theme } = useSage();
  return (
    <FadeSlide from="none" style={{ alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl, gap: theme.spacing.md }}>
      <Pulse active>
        <View style={[{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' }, gradientStyle(theme.gradients.primary), shadowStyle(theme, 'md')]}>
          <ActivityIndicator color={theme.colors.onPrimary} />
        </View>
      </Pulse>
      <Text style={[typeStyle(theme, theme.typography.body), { color: theme.colors.textMuted }]}>{label}</Text>
    </FadeSlide>
  );
}

export function Heading({ children, size }: { children: ReactNode; size?: number }) {
  const { theme } = useSage();
  const token = size && size >= 22 ? theme.typography.title : theme.typography.heading;
  return (
    <Text style={[typeStyle(theme, token), { color: theme.colors.text }, size ? { fontSize: size, lineHeight: Math.round(size * token.lineHeight) } : null]}>
      {children}
    </Text>
  );
}

export function Body({ children, muted, center, style }: { children: ReactNode; muted?: boolean; center?: boolean; style?: StyleProp<TextStyle> }) {
  const { theme } = useSage();
  return (
    <Text style={[typeStyle(theme, theme.typography.body), { color: muted ? theme.colors.textMuted : theme.colors.text, textAlign: center ? 'center' : 'left' }, style]}>
      {children}
    </Text>
  );
}
