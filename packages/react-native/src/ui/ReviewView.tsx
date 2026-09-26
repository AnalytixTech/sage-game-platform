import React, { ReactNode } from 'react';
import { ActivityIndicator, StyleProp, Text, View, ViewStyle } from 'react-native';
import { EndReason, formatClock, RenderOverride, reviewTitle, useSage, useSlotStyle } from '@sagegames/react-headless';
import { Button, Stat, Surface, typeStyle } from './primitives';

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
  const slotStyle = useSlotStyle<StyleProp<ViewStyle>>('review');
  const c = theme.colors;

  const element = (
    <View style={[{ gap: theme.spacing.lg }, slotStyle]}>
      <Surface tone="raised" elevation="md" style={{ gap: theme.spacing.md }}>
        <Text accessibilityRole="header" style={[typeStyle(theme, theme.typography.title), { color: c.text }]}>
          {reviewTitle(reason, labels)}
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.md }}>
          <Stat label={labels.score} value={score} icon="star" />
          <Stat label={labels.time} value={formatClock(elapsedMs)} icon="clock" align="center" />
          {stat && <Stat label={stat.label} value={stat.value} align="flex-end" />}
        </View>
        <Button label={labels.continue} icon="play" onPress={onContinue} testID="sage-review-continue" />
        <View style={{ minHeight: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }} accessibilityLiveRegion="polite">
          {status && (
            <>
              {statusTone === 'muted' && <ActivityIndicator size="small" color={c.textMuted} />}
              <Text style={[typeStyle(theme, theme.typography.caption), { color: statusTone === 'danger' ? c.danger : c.textMuted }]}>{status}</Text>
            </>
          )}
        </View>
      </Surface>
      <View pointerEvents="box-none">{board}</View>
    </View>
  );

  return <>{render ? render({ board, score, elapsedMs, reason, verifying, continue: onContinue }, element) : element}</>;
}
