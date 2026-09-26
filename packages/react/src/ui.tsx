import React, { CSSProperties, ReactNode } from 'react';
import { alpha, isHex, SageTheme, touchTarget, TypeToken, useSage, useSlot, useSlotStyle } from '@sagegames/react-headless';
import { Icon, IconName } from './icons';
import { FadeSlide, Pop, Pulse, useMotion } from './motion';

export * from './icons';
export * from './motion';

const FALLBACK_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export function font(theme: SageTheme, weight: 'regular' | 'medium' | 'bold'): CSSProperties {
  return {
    fontFamily: theme.fonts[weight] || FALLBACK_FONT,
    fontWeight: weight === 'bold' ? 700 : weight === 'medium' ? 600 : 400,
  };
}

/** CSS for a typography token. */
export function typeStyle(theme: SageTheme, token: TypeToken): CSSProperties {
  return { ...font(theme, token.weight), fontSize: token.size, letterSpacing: token.letterSpacing, lineHeight: token.lineHeight };
}

const rgba = (color: string, opacity: number) => (isHex(color) ? alpha(color, opacity) : color);

export function shadowCss(theme: SageTheme, level: 'none' | 'sm' | 'md' | 'lg'): string {
  if (level === 'none') return 'none';
  const s = theme.elevation[level];
  return `0 ${s.offsetY}px ${s.radius}px ${rgba(s.color, s.opacity)}`;
}

export function gradientCss(stops: readonly [string, string] | string[], angle = 135): string {
  const [from, to] = stops;
  return from === to ? from : `linear-gradient(${angle}deg, ${from}, ${to})`;
}

/** One-time styles for things inline styles can't express (keyframes, focus rings, pressed states). */
export function SageStyles() {
  const { theme } = useSage();
  const c = theme.colors;
  return (
    <style>{`
      .sg-root *, .sg-root *::before, .sg-root *::after { box-sizing: border-box; }
      .sg-root { -webkit-font-smoothing: antialiased; }
      .sg-root button { cursor: pointer; -webkit-tap-highlight-color: transparent; font: inherit; filter: none; margin: 0; }
      .sg-root button:disabled { cursor: not-allowed; }
      .sg-root button:focus-visible, .sg-root [tabindex]:focus-visible { outline: 2px solid ${c.focus}; outline-offset: 2px; }
      .sg-press { transition: transform 140ms cubic-bezier(.2,.8,.3,1.2), filter 140ms, box-shadow 140ms; }
      .sg-press:not(:disabled):hover { filter: brightness(1.06); }
      .sg-press:not(:disabled):active { transform: scale(0.96); }
      .sg-spinner { width: 26px; height: 26px; border-radius: 50%; border: 3px solid ${rgba(c.onPrimary, 0.35)}; border-top-color: ${c.onPrimary}; animation: sg-spin 0.8s linear infinite; }
      .sg-card-face { transition: transform 0.18s ease, background-color 0.18s ease; }
      @keyframes sg-spin { to { transform: rotate(360deg); } }
      @keyframes sg-pop { 0% { transform: scale(1); } 35% { transform: scale(1.14); } 70% { transform: scale(0.97); } 100% { transform: scale(1); } }
      @keyframes sg-shake { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-8px); } 40% { transform: translateX(8px); } 60% { transform: translateX(-5px); } 80% { transform: translateX(4px); } }
      @keyframes sg-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
      @keyframes sg-fade { from { opacity: 0; } to { opacity: 1; } }
      @keyframes sg-fade-up { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
      @keyframes sg-fade-down { from { opacity: 0; transform: translateY(-14px); } to { opacity: 1; transform: none; } }
      @keyframes sg-fade-from-right { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: none; } }
      @keyframes sg-fade-from-left { from { opacity: 0; transform: translateX(-24px); } to { opacity: 1; transform: none; } }
      @keyframes sg-float { 0% { opacity: 0; transform: translate(-50%, 6px); } 15% { opacity: 1; } 70% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -34px); } }
      @keyframes sg-confetti { 0% { transform: translate(0, 0) rotate(0); opacity: 1; } 80% { opacity: 1; } 100% { transform: translate(var(--sg-dx), 520px) rotate(var(--sg-rot)); opacity: 0; } }
      @keyframes sg-flash { 0% { opacity: 0; } 20% { opacity: 0.9; } 100% { opacity: 0; } }
      @keyframes sg-shimmer { from { background-position: -200% 0; } to { background-position: 200% 0; } }
      @keyframes sg-sweep { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
      @media (prefers-reduced-motion: reduce) {
        .sg-root *, .sg-root *::before, .sg-root *::after { animation-duration: 1ms !important; animation-iteration-count: 1 !important; transition-duration: 1ms !important; }
        .sg-spinner { animation: sg-spin 2s linear infinite !important; }
      }
    `}</style>
  );
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  label,
  onClick,
  variant = 'primary',
  disabled,
  loading,
  compact,
  icon,
  style,
  ariaLabel,
  testId,
}: {
  label: string;
  onClick: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  compact?: boolean;
  icon?: IconName;
  style?: CSSProperties;
  ariaLabel?: string;
  testId?: string;
}) {
  const { theme } = useSage();
  const Custom = useSlot('Button');
  const slotStyle = useSlotStyle<CSSProperties>('button');
  if (Custom) {
    return (
      <span style={{ display: 'contents', ...style }}>
        <Custom label={label} onPress={onClick} variant={variant} disabled={disabled} loading={loading} compact={compact} icon={icon} accessibilityLabel={ariaLabel} />
      </span>
    );
  }
  const c = theme.colors;
  const fg = { primary: c.onPrimary, secondary: c.text, ghost: c.text, danger: c.danger }[variant];
  const fill: CSSProperties =
    variant === 'primary'
      ? { background: gradientCss(theme.gradients.primary), border: '1px solid transparent', boxShadow: shadowCss(theme, 'sm') }
      : { background: variant === 'secondary' ? c.surfaceAlt : 'transparent', border: `1px solid ${variant === 'danger' ? c.danger : c.border}` };
  return (
    <button
      type="button"
      className="sg-press"
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      data-testid={testId}
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        ...fill,
        color: fg,
        minHeight: compact ? 40 : touchTarget(theme) + 4,
        borderRadius: theme.radii.md,
        padding: compact ? '0 14px' : '0 22px',
        fontSize: compact ? 14 : 16,
        letterSpacing: 0.2,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        opacity: disabled ? 0.45 : 1,
        ...font(theme, 'bold'),
        ...slotStyle,
        ...style,
      }}
    >
      {loading ? <span className="sg-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : icon ? <Icon name={icon} size={compact ? 14 : 16} color={fg} /> : null}
      {label}
    </button>
  );
}

/** Round icon-only button (pause, close). */
export function IconButton({ icon, onClick, label, disabled }: { icon: IconName; onClick: () => void; label: string; disabled?: boolean }) {
  const { theme } = useSage();
  return (
    <button
      type="button"
      className="sg-press"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      style={{ width: 40, height: 40, borderRadius: 20, display: 'grid', placeItems: 'center', background: theme.colors.surfaceAlt, border: `1px solid ${theme.colors.border}`, padding: 0 }}
    >
      <Icon name={icon} size={16} color={theme.colors.text} />
    </button>
  );
}

export interface SurfaceProps {
  children?: ReactNode;
  elevation?: 'none' | 'sm' | 'md' | 'lg';
  gradient?: keyof SageTheme['gradients'] | [string, string];
  radius?: keyof SageTheme['radii'];
  padded?: boolean;
  border?: boolean;
  tone?: 'surface' | 'alt' | 'raised';
  style?: CSSProperties;
  className?: string;
  testId?: string;
}

export function Surface({ children, elevation = 'md', gradient, radius = 'lg', padded = true, border = true, tone = 'surface', style, className, testId }: SurfaceProps) {
  const { theme } = useSage();
  const slotStyle = useSlotStyle<CSSProperties>('card');
  const c = theme.colors;
  const background = gradient
    ? gradientCss(typeof gradient === 'string' ? theme.gradients[gradient] : gradient)
    : tone === 'alt'
      ? c.surfaceAlt
      : tone === 'raised'
        ? c.surfaceRaised
        : c.surface;
  return (
    <div
      className={className}
      data-testid={testId}
      style={{
        background,
        border: border && !gradient ? `1px solid ${c.border}` : 'none',
        borderRadius: theme.radii[radius],
        boxShadow: shadowCss(theme, elevation),
        padding: padded ? (theme.density === 'compact' ? theme.spacing.md : theme.spacing.lg) : 0,
        ...slotStyle,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Card({ children, style, elevation = 'md', gradient }: { children: ReactNode; style?: CSSProperties; elevation?: SurfaceProps['elevation']; gradient?: SurfaceProps['gradient'] }) {
  return (
    <Surface style={style} elevation={elevation} gradient={gradient}>
      {children}
    </Surface>
  );
}

export type Tone = 'neutral' | 'primary' | 'success' | 'danger' | 'warning' | 'accent';

export function Chip({ label, tone = 'neutral', icon, color, style }: { label: string; tone?: Tone; icon?: ReactNode; color?: string; style?: CSSProperties }) {
  const { theme } = useSage();
  const slotStyle = useSlotStyle<CSSProperties>('chip');
  const c = theme.colors;
  const fg = color ?? { neutral: c.textMuted, primary: c.primary, success: c.success, danger: c.danger, warning: c.warning, accent: c.primaryAlt }[tone];
  const base = isHex(fg) ? fg : c.primary;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 10px',
        borderRadius: theme.radii.pill,
        background: rgba(base, 0.14),
        border: `1px solid ${rgba(base, 0.35)}`,
        color: fg,
        whiteSpace: 'nowrap',
        ...typeStyle(theme, theme.typography.caption),
        ...slotStyle,
        ...style,
      }}
    >
      {icon}
      {label}
    </span>
  );
}

export function Badge({ children, color, textColor, size = 28 }: { children: ReactNode; color?: string; textColor?: string; size?: number }) {
  const { theme } = useSage();
  return (
    <span
      style={{
        minWidth: size,
        height: size,
        padding: '0 6px',
        borderRadius: size / 2,
        background: color ?? theme.colors.primary,
        color: textColor ?? theme.colors.onPrimary,
        display: 'inline-grid',
        placeItems: 'center',
        fontSize: size * 0.46,
        ...font(theme, 'bold'),
      }}
    >
      {children}
    </span>
  );
}

export function Avatar({ name, size = 36, color }: { name: string; size?: number; color?: string }) {
  const { theme } = useSage();
  const initials = name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?';
  const palette = Object.values(theme.colors.gameAccents);
  const bg = color ?? palette[[...name].reduce((h, ch) => h + ch.charCodeAt(0), 0) % palette.length];
  return (
    <span aria-hidden style={{ width: size, height: size, flex: 'none', borderRadius: '50%', background: bg, color: '#fff', display: 'inline-grid', placeItems: 'center', fontSize: size * 0.38, ...font(theme, 'bold') }}>
      {initials}
    </span>
  );
}

export function Stat({ label, value, align = 'left', icon }: { label: string; value: ReactNode; align?: 'left' | 'center' | 'right'; icon?: IconName }) {
  const { theme } = useSage();
  return (
    <div style={{ textAlign: align }}>
      <div style={{ color: theme.colors.textMuted, textTransform: 'uppercase', display: 'flex', gap: 4, alignItems: 'center', justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start', ...typeStyle(theme, theme.typography.caption) }}>
        {icon && <Icon name={icon} size={12} color={theme.colors.textMuted} />}
        {label}
      </div>
      <Pop trigger={value}>
        <div style={{ color: theme.colors.text, fontVariantNumeric: 'tabular-nums', ...typeStyle(theme, theme.typography.numeric) }}>{value}</div>
      </Pop>
    </div>
  );
}

export function ProgressBar({ fraction, color, height = 8 }: { fraction: number; color?: string; height?: number }) {
  const { theme } = useSage();
  const motion = useMotion();
  const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 1000) / 10;
  return (
    <div role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} style={{ height, borderRadius: height / 2, background: theme.colors.surfaceAlt, overflow: 'hidden' }}>
      <div
        style={{
          width: `${pct}%`,
          height,
          borderRadius: height / 2,
          background: color ?? gradientCss(theme.gradients.primary, 90),
          transition: motion.reduced ? undefined : `width ${motion.ms('fast')}ms linear, background-color 300ms`,
        }}
      />
    </div>
  );
}

export function Loading({ label }: { label: string }) {
  const { theme } = useSage();
  return (
    <FadeSlide from="none">
      <div role="status" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: theme.spacing.md, padding: theme.spacing.xl }}>
        <Pulse active>
          <div style={{ width: 56, height: 56, borderRadius: 28, display: 'grid', placeItems: 'center', background: gradientCss(theme.gradients.primary), boxShadow: shadowCss(theme, 'md') }}>
            <div className="sg-spinner" />
          </div>
        </Pulse>
        <div style={{ color: theme.colors.textMuted, ...typeStyle(theme, theme.typography.body) }}>{label}</div>
      </div>
    </FadeSlide>
  );
}

export function Heading({ children, size }: { children: ReactNode; size?: number }) {
  const { theme } = useSage();
  const token = size && size >= 22 ? theme.typography.title : theme.typography.heading;
  return <div style={{ color: theme.colors.text, margin: 0, ...typeStyle(theme, token), ...(size ? { fontSize: size } : null) }}>{children}</div>;
}

export function Body({ children, muted, center, style }: { children: ReactNode; muted?: boolean; center?: boolean; style?: CSSProperties }) {
  const { theme } = useSage();
  return (
    <p style={{ margin: 0, color: muted ? theme.colors.textMuted : theme.colors.text, textAlign: center ? 'center' : 'left', ...typeStyle(theme, theme.typography.body), ...style }}>
      {children}
    </p>
  );
}

export const stack = (gap: number, extra?: CSSProperties): CSSProperties => ({ display: 'flex', flexDirection: 'column', gap, ...extra });
export const row = (gap: number, extra?: CSSProperties): CSSProperties => ({ display: 'flex', flexDirection: 'row', gap, ...extra });
