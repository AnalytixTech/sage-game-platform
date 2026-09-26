import React, { CSSProperties, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { MotionSettings, useMotionSettings, useSage } from '@sagegames/react-headless';

/** The browser's prefers-reduced-motion, kept up to date. */
export function useOsReducedMotion(): boolean {
  const query = useMemo(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null), []);
  const [reduced, setReduced] = useState(!!query?.matches);
  useEffect(() => {
    if (!query) return;
    const on = () => setReduced(query.matches);
    query.addEventListener?.('change', on);
    return () => query.removeEventListener?.('change', on);
  }, [query]);
  return reduced;
}

export function useMotion(): MotionSettings {
  return useMotionSettings(useOsReducedMotion());
}

/** Counts changes of `trigger` (not the first value), for re-keying CSS animations. */
function useChangeCount(trigger: unknown): number {
  const [count, setCount] = useState(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (trigger !== null && trigger !== undefined && trigger !== false) setCount((c) => c + 1);
  }, [trigger]);
  return count;
}

const KEYFRAMES: Record<'pop' | 'shake', Keyframe[]> = {
  pop: [{ transform: 'scale(1)' }, { transform: 'scale(1.14)', offset: 0.35 }, { transform: 'scale(0.97)', offset: 0.7 }, { transform: 'scale(1)' }],
  shake: [
    { transform: 'translateX(0)' },
    { transform: 'translateX(-8px)', offset: 0.2 },
    { transform: 'translateX(8px)', offset: 0.4 },
    { transform: 'translateX(-5px)', offset: 0.6 },
    { transform: 'translateX(4px)', offset: 0.8 },
    { transform: 'translateX(0)' },
  ],
};

/** Plays a keyframe animation on its wrapper when `trigger` changes, without remounting children. */
function Animate({ name, trigger, duration, children, style, inline }: { name: 'pop' | 'shake'; trigger: unknown; duration: number; children: ReactNode; style?: CSSProperties; inline?: boolean }) {
  const motion = useMotion();
  const count = useChangeCount(trigger);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!count || motion.reduced) return;
    ref.current?.animate?.(KEYFRAMES[name], { duration, easing: 'cubic-bezier(.2,.8,.3,1.2)' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);
  return inline ? (
    <span ref={ref as React.RefObject<HTMLSpanElement>} style={{ display: 'inline-block', ...style }}>
      {children}
    </span>
  ) : (
    <div ref={ref as React.RefObject<HTMLDivElement>} style={style}>
      {children}
    </div>
  );
}

/** Springy "boing" when `trigger` changes. */
export function Pop({ trigger, children, style, inline }: { trigger: unknown; children: ReactNode; style?: CSSProperties; inline?: boolean }) {
  const motion = useMotion();
  return (
    <Animate name="pop" trigger={trigger} duration={Math.max(1, motion.ms('slow'))} style={style} inline={inline}>
      {children}
    </Animate>
  );
}

/** Side-to-side shake when `trigger` changes. */
export function Shake({ trigger, children, style }: { trigger: unknown; children: ReactNode; style?: CSSProperties }) {
  return (
    <Animate name="shake" trigger={trigger} duration={320} style={style}>
      {children}
    </Animate>
  );
}

/** Gentle breathing loop while `active`. */
export function Pulse({ active, children, style }: { active: boolean; children: ReactNode; style?: CSSProperties }) {
  const motion = useMotion();
  return <div style={{ animation: active && !motion.reduced ? 'sg-pulse 1.04s ease-in-out infinite' : undefined, ...style }}>{children}</div>;
}

/** Fade and slide in on mount (and whenever `trigger` changes). */
export function FadeSlide({
  children,
  trigger,
  from = 'bottom',
  delay = 0,
  style,
}: {
  children: ReactNode;
  trigger?: unknown;
  from?: 'bottom' | 'top' | 'right' | 'left' | 'none';
  delay?: number;
  style?: CSSProperties;
}) {
  const motion = useMotion();
  const name = { none: 'sg-fade', top: 'sg-fade-down', bottom: 'sg-fade-up', right: 'sg-fade-from-right', left: 'sg-fade-from-left' }[from];
  return (
    <div
      key={String(trigger ?? '')}
      style={{ animation: motion.reduced ? undefined : `${name} ${motion.ms('base')}ms cubic-bezier(.2,.7,.2,1) ${delay}ms both`, ...style }}
    >
      {children}
    </div>
  );
}

/** A number that counts up to `value`. */
export function CountUp({ value, duration = 900, style, format = (n: number) => String(n) }: { value: number; duration?: number; style?: CSSProperties; format?: (n: number) => string }) {
  const motion = useMotion();
  const [shown, setShown] = useState(motion.reduced ? value : 0);
  const from = useRef(motion.reduced ? value : 0);
  useEffect(() => {
    if (motion.reduced || typeof requestAnimationFrame === 'undefined') {
      setShown(value);
      from.current = value;
      return;
    }
    const start = from.current;
    const t0 = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - (1 - p) ** 3;
      setShown(Math.round(start + (value - start) * eased));
      if (p < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, motion.reduced]);
  return <span style={{ fontVariantNumeric: 'tabular-nums', ...style }}>{format(shown)}</span>;
}

/** "+120" that rises and fades each time `trigger` changes. */
export function FloatUp({ trigger, text, color, style }: { trigger: unknown; text: string; color?: string; style?: CSSProperties }) {
  const { theme } = useSage();
  const motion = useMotion();
  const count = useChangeCount(trigger);
  if (!count || motion.reduced) return null;
  return (
    <span
      key={count}
      aria-hidden
      style={{
        position: 'absolute',
        left: '50%',
        top: 0,
        pointerEvents: 'none',
        color: color ?? theme.colors.success,
        fontSize: 20,
        fontWeight: 800,
        textShadow: '0 2px 6px rgba(0,0,0,.35)',
        animation: 'sg-float 900ms ease-out both',
        ...style,
      }}
    >
      {text}
    </span>
  );
}

/** A burst of confetti over the nearest positioned parent each time `fire` changes. */
export function Confetti({ fire, count = 42, colors }: { fire: unknown; count?: number; colors?: string[] }) {
  const { theme } = useSage();
  const motion = useMotion();
  const burst = useChangeCount(fire);
  const palette = colors ?? [theme.colors.primary, theme.colors.primaryAlt, ...Object.values(theme.colors.gameAccents), theme.colors.warning];
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        dx: (Math.random() - 0.5) * 160,
        rot: (Math.random() - 0.5) * 720,
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
    <div key={burst} aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 5 }}>
      {pieces.map((p, i) => (
        <span
          key={i}
          style={
            {
              position: 'absolute',
              top: -12,
              left: `${p.left}%`,
              width: p.size,
              height: p.round ? p.size : p.size * 0.45,
              borderRadius: p.round ? '50%' : 1,
              background: p.color,
              '--sg-dx': `${p.dx}px`,
              '--sg-rot': `${p.rot}deg`,
              animation: `sg-confetti ${1400 + p.delay}ms cubic-bezier(.3,.1,.7,1) ${p.delay}ms both`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
