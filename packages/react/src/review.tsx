import React, { CSSProperties, ReactNode } from 'react';
import { EndReason, formatClock, RenderOverride, reviewTitle, useSage, useSlotStyle } from '@sagegames/react-headless';
import { Button, row, stack, Stat, Surface, typeStyle } from './ui';

export interface ReviewInfo {
  board: ReactNode;
  score: number;
  elapsedMs: number;
  reason: EndReason;
  /** The result is still being verified (or, in a battle, others are still racing). */
  verifying: boolean;
  continue: () => void;
}

export type RenderReview = RenderOverride<ReviewInfo>;

/**
 * The finished board, read-only, with a compact summary and Continue. Shown after a game ends
 * while the score is verified in the background.
 */
export function ReviewView({
  board,
  score,
  elapsedMs,
  reason,
  stat,
  status,
  statusTone = 'muted',
  verifying,
  onContinue,
  render,
}: {
  board: ReactNode;
  score: number;
  elapsedMs: number;
  reason: EndReason;
  stat?: { label: string; value: string } | null;
  /** Inline status next to Continue ("Checking your score…", "Retrying…"); null when done. */
  status: string | null;
  statusTone?: 'muted' | 'danger';
  verifying: boolean;
  onContinue: () => void;
  render?: RenderReview;
}) {
  const { theme, labels } = useSage();
  const slotStyle = useSlotStyle<CSSProperties>('review');
  const c = theme.colors;

  const element = (
    <div style={stack(theme.spacing.lg, slotStyle)}>
      <Surface tone="raised" elevation="md" style={stack(theme.spacing.md)}>
        <h2 style={{ margin: 0, color: c.text, ...typeStyle(theme, theme.typography.title) }}>{reviewTitle(reason, labels)}</h2>
        <div style={row(theme.spacing.md, { justifyContent: 'space-between' })}>
          <Stat label={labels.score} value={score} icon="star" />
          <Stat label={labels.time} value={formatClock(elapsedMs)} icon="clock" align="center" />
          {stat && <Stat label={stat.label} value={stat.value} align="right" />}
        </div>
        <Button label={labels.continue} icon="play" onClick={onContinue} testId="sage-review-continue" />
        <div role="status" aria-live="polite" style={row(8, { minHeight: 20, alignItems: 'center', justifyContent: 'center' })}>
          {status && (
            <>
              {statusTone === 'muted' && <span className="sg-spinner-sm" aria-hidden />}
              <span style={{ color: statusTone === 'danger' ? c.danger : c.textMuted, ...typeStyle(theme, theme.typography.caption), letterSpacing: 0 }}>{status}</span>
            </>
          )}
        </div>
      </Surface>
      <div>{board}</div>
    </div>
  );

  return <>{render ? render({ board, score, elapsedMs, reason, verifying, continue: onContinue }, element) : element}</>;
}
