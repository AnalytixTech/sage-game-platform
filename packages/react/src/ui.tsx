import React, { CSSProperties, ReactNode } from 'react';
import { SageTheme, useSage } from '@sagegames/react-headless';

export function font(theme: SageTheme, weight: 'regular' | 'medium' | 'bold'): CSSProperties {
  return {
    fontFamily: theme.fonts[weight] || 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    fontWeight: weight === 'bold' ? 700 : weight === 'medium' ? 600 : 400,
  };
}

/** One-time styles for things inline styles can't express (focus rings, spinner, reduced motion). */
export function SageStyles() {
  const { theme } = useSage();
  return (
    <style>{`
      .sg-root *, .sg-root *::before, .sg-root *::after { box-sizing: border-box; }
      .sg-root button { cursor: pointer; -webkit-tap-highlight-color: transparent; }
      .sg-root button:disabled { cursor: not-allowed; }
      .sg-root button:focus-visible, .sg-root [tabindex]:focus-visible { outline: 2px solid ${theme.colors.primary}; outline-offset: 2px; }
      .sg-spinner { width: 36px; height: 36px; border-radius: 50%; border: 3px solid ${theme.colors.surfaceAlt}; border-top-color: ${theme.colors.primary}; animation: sg-spin 0.8s linear infinite; }
      .sg-card-face { transition: transform 0.18s ease, background-color 0.18s ease; }
      @keyframes sg-spin { to { transform: rotate(360deg); } }
      @media (prefers-reduced-motion: reduce) { .sg-spinner { animation-duration: 2s; } .sg-card-face { transition: none; } }
    `}</style>
  );
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  label,
  onClick,
  variant = 'primary',
  disabled,
  compact,
  style,
  ariaLabel,
}: {
  label: string;
  onClick: () => void;
  variant?: Variant;
  disabled?: boolean;
  compact?: boolean;
  style?: CSSProperties;
  ariaLabel?: string;
}) {
  const { theme } = useSage();
  const c = theme.colors;
  const bg = { primary: c.primary, secondary: c.surfaceAlt, ghost: 'transparent', danger: 'transparent' }[variant];
  const fg = { primary: c.onPrimary, secondary: c.text, ghost: c.text, danger: c.danger }[variant];
  const border = variant === 'ghost' ? c.border : variant === 'danger' ? c.danger : bg;
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      style={{
        background: bg,
        color: fg,
        border: `1px solid ${border}`,
        borderRadius: theme.radii.md,
        padding: compact ? '8px 12px' : '12px 20px',
        fontSize: compact ? 14 : 16,
        opacity: disabled ? 0.45 : 1,
        ...font(theme, 'bold'),
        ...style,
      }}
    >
      {label}
    </button>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  const { theme } = useSage();
  return (
    <div
      style={{
        background: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: theme.radii.lg,
        padding: theme.spacing.lg,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Stat({ label, value, align = 'left' }: { label: string; value: ReactNode; align?: 'left' | 'center' | 'right' }) {
  const { theme } = useSage();
  return (
    <div style={{ textAlign: align }}>
      <div style={{ color: theme.colors.textMuted, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', ...font(theme, 'medium') }}>{label}</div>
      <div style={{ color: theme.colors.text, fontSize: 20, fontVariantNumeric: 'tabular-nums', ...font(theme, 'bold') }}>{value}</div>
    </div>
  );
}

export function ProgressBar({ fraction, color }: { fraction: number; color?: string }) {
  const { theme } = useSage();
  const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  return (
    <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} style={{ height: 6, borderRadius: 3, background: theme.colors.surfaceAlt, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: 6, background: color ?? theme.colors.primary, transition: 'width 0.25s linear' }} />
    </div>
  );
}

export function Loading({ label }: { label: string }) {
  const { theme } = useSage();
  return (
    <div role="status" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: theme.spacing.md, padding: theme.spacing.xl }}>
      <div className="sg-spinner" />
      <div style={{ color: theme.colors.textMuted, fontSize: 15, ...font(theme, 'regular') }}>{label}</div>
    </div>
  );
}

export function Heading({ children, size = 20 }: { children: ReactNode; size?: number }) {
  const { theme } = useSage();
  return <div style={{ color: theme.colors.text, fontSize: size, margin: 0, ...font(theme, 'bold') }}>{children}</div>;
}

export function Body({ children, muted, center, style }: { children: ReactNode; muted?: boolean; center?: boolean; style?: CSSProperties }) {
  const { theme } = useSage();
  return (
    <p
      style={{
        margin: 0,
        color: muted ? theme.colors.textMuted : theme.colors.text,
        fontSize: 15,
        lineHeight: 1.45,
        textAlign: center ? 'center' : 'left',
        ...font(theme, 'regular'),
        ...style,
      }}
    >
      {children}
    </p>
  );
}

export const stack = (gap: number, extra?: CSSProperties): CSSProperties => ({ display: 'flex', flexDirection: 'column', gap, ...extra });
export const row = (gap: number, extra?: CSSProperties): CSSProperties => ({ display: 'flex', flexDirection: 'row', gap, ...extra });
