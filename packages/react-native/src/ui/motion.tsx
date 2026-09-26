import React, { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleProp, Text, TextStyle, useWindowDimensions, View, ViewStyle } from 'react-native';
import { MotionSettings, useMotionSettings, useSage } from '@sagegames/react-headless';

/** The OS "reduce motion" setting, kept up to date. */
export function useOsReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((r) => alive && setReduced(!!r))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (r: boolean) => setReduced(!!r));
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return reduced;
}

/** Motion settings for this app (OS setting + provider + theme). */
export function useMotion(): MotionSettings {
  return useMotionSettings(useOsReducedMotion());
}

/** Scale-on-press for anything pressable: spread `handlers` onto the Pressable, `style` onto an Animated.View. */
export function usePressScale(pressedScale = 0.96) {
  const motion = useMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) => {
    if (motion.reduced) return;
    Animated.spring(scale, { toValue: v, useNativeDriver: true, tension: 300, friction: 20 }).start();
  };
  return {
    style: { transform: [{ scale }] },
    handlers: { onPressIn: () => to(pressedScale), onPressOut: () => to(1) },
  };
}

/** Run an animation whenever `trigger` changes (not on mount). */
function useOnChange(trigger: unknown, run: () => void) {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (trigger !== null && trigger !== undefined && trigger !== false) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);
}

/** Springy "boing" when `trigger` changes. */
export function Pop({ trigger, children, peak = 1.14, style }: { trigger: unknown; children: ReactNode; peak?: number; style?: StyleProp<ViewStyle> }) {
  const motion = useMotion();
  const scale = useRef(new Animated.Value(1)).current;
  useOnChange(trigger, () => {
    if (motion.reduced) return;
    scale.setValue(1);
    Animated.sequence([
      Animated.timing(scale, { toValue: peak, duration: motion.ms('fast'), easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, tension: motion.spring.tension, friction: motion.spring.friction, useNativeDriver: true }),
    ]).start();
  });
  return <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>;
}

/** Side-to-side shake (a miss or a rejection) when `trigger` changes. */
export function Shake({ trigger, children, style }: { trigger: unknown; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const motion = useMotion();
  const x = useRef(new Animated.Value(0)).current;
  useOnChange(trigger, () => {
    if (motion.reduced) return;
    const step = (v: number) => Animated.timing(x, { toValue: v, duration: 45, useNativeDriver: true });
    Animated.sequence([step(-8), step(8), step(-6), step(6), step(-3), step(0)]).start();
  });
  return <Animated.View style={[style, { transform: [{ translateX: x }] }]}>{children}</Animated.View>;
}

/** Gentle breathing loop while `active` (low time, waiting for players). */
export function Pulse({ active, children, amount = 1.06, style }: { active: boolean; children: ReactNode; amount?: number; style?: StyleProp<ViewStyle> }) {
  const motion = useMotion();
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active || motion.reduced) {
      scale.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: amount, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, motion.reduced, amount, scale]);
  return <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>;
}

/** Fade and slide in on mount (and again whenever `trigger` changes). */
export function FadeSlide({
  children,
  trigger,
  from = 'bottom',
  distance = 14,
  delay = 0,
  style,
}: {
  children: ReactNode;
  trigger?: unknown;
  from?: 'bottom' | 'top' | 'right' | 'left' | 'none';
  distance?: number;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const motion = useMotion();
  const t = useRef(new Animated.Value(motion.reduced ? 1 : 0)).current;
  useEffect(() => {
    if (motion.reduced) {
      t.setValue(1);
      return;
    }
    t.setValue(0);
    Animated.timing(t, { toValue: 1, duration: motion.ms('base'), delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger, motion.reduced]);
  const offset = t.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] });
  const transform =
    from === 'bottom' ? [{ translateY: offset }] : from === 'top' ? [{ translateY: Animated.multiply(offset, -1) }] : from === 'right' ? [{ translateX: offset }] : from === 'left' ? [{ translateX: Animated.multiply(offset, -1) }] : [];
  return <Animated.View style={[style, { opacity: t, transform }]}>{children}</Animated.View>;
}

/** A number that counts up to `value`. */
export function CountUp({ value, duration = 900, style, format = (n: number) => String(n) }: { value: number; duration?: number; style?: StyleProp<TextStyle>; format?: (n: number) => string }) {
  const motion = useMotion();
  const [shown, setShown] = useState(motion.reduced ? value : 0);
  const from = useRef(motion.reduced ? value : 0);
  useEffect(() => {
    if (motion.reduced) {
      setShown(value);
      from.current = value;
      return;
    }
    const start = from.current;
    const anim = new Animated.Value(0);
    const id = anim.addListener(({ value: p }) => setShown(Math.round(start + (value - start) * p)));
    Animated.timing(anim, { toValue: 1, duration: duration * Math.max(0.3, Math.min(1, motion.ms('slow') / 420)), easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(() => {
      from.current = value;
      setShown(value);
    });
    return () => {
      anim.removeListener(id);
      anim.stopAnimation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, motion.reduced]);
  return <Text style={style}>{format(shown)}</Text>;
}

/** "+120" that rises and fades, shown each time `trigger` changes. */
export function FloatUp({ trigger, text, color, style }: { trigger: unknown; text: string; color?: string; style?: StyleProp<ViewStyle> }) {
  const { theme } = useSage();
  const motion = useMotion();
  const t = useRef(new Animated.Value(1)).current;
  const [label, setLabel] = useState('');
  useOnChange(trigger, () => {
    setLabel(text);
    if (motion.reduced) return;
    t.setValue(0);
    Animated.timing(t, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  });
  if (!label) return null;
  const opacity = motion.reduced ? 0 : t.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 1, 0] });
  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [6, -34] });
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', alignSelf: 'center', opacity, transform: [{ translateY }] }, style]}>
      <Text style={{ color: color ?? theme.colors.success, fontSize: 20, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 4 }}>{label}</Text>
    </Animated.View>
  );
}

/** A burst of confetti over the parent (position: relative) each time `fire` changes. */
export function Confetti({ fire, count = 42, colors }: { fire: unknown; count?: number; colors?: string[] }) {
  const { theme } = useSage();
  const motion = useMotion();
  const { width, height } = useWindowDimensions();
  const [burst, setBurst] = useState(0);
  useOnChange(fire, () => motion.celebrations && setBurst((b) => b + 1));
  const palette = colors ?? [theme.colors.primary, theme.colors.primaryAlt, ...Object.values(theme.colors.gameAccents), theme.colors.warning];
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: Math.random() * width,
        drift: (Math.random() - 0.5) * 120,
        spin: (Math.random() - 0.5) * 720,
        delay: Math.random() * 220,
        size: 6 + Math.random() * 6,
        color: palette[i % palette.length],
        round: Math.random() > 0.6,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [burst]
  );
  if (!burst || !motion.celebrations) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
      {pieces.map((p, i) => (
        <ConfettiPiece key={`${burst}-${i}`} piece={p} fall={height} />
      ))}
    </View>
  );
}

function ConfettiPiece({ piece, fall }: { piece: { x: number; drift: number; spin: number; delay: number; size: number; color: string; round: boolean }; fall: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 1400 + piece.delay, delay: piece.delay, easing: Easing.in(Easing.quad), useNativeDriver: true }).start();
  }, [t, piece.delay]);
  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [-20, fall * 0.85] });
  const translateX = t.interpolate({ inputRange: [0, 1], outputRange: [0, piece.drift] });
  const rotate = t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${piece.spin}deg`] });
  const opacity = t.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] });
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: piece.x,
        top: 0,
        width: piece.size,
        height: piece.round ? piece.size : piece.size * 0.45,
        borderRadius: piece.round ? piece.size / 2 : 1,
        backgroundColor: piece.color,
        opacity,
        transform: [{ translateY }, { translateX }, { rotate }],
      }}
    />
  );
}
