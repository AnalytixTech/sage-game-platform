import React, { useEffect, useState } from 'react';
import { StyleProp, Text, View, ViewStyle } from 'react-native';
import { CompletionResult, SessionCredentials } from '@sagegames/types';
import { alpha, formatDuration, gameGlyph, useFeedback, useLeaderboard, useSage, useSlot, useSlotStyle } from '@sagegames/react-headless';
import { Body, Button, Card, Chip, Confetti, CountUp, FadeSlide, Heading, Icon, Surface, typeStyle } from './primitives';

const MEDAL = ['medal1', 'medal2', 'medal3'] as const;

export function LeaderboardList({ session, highlightUserRank }: { session: SessionCredentials; highlightUserRank?: number | null }) {
  const { theme, labels } = useSage();
  const { board, loading } = useLeaderboard(session, { scope: 'context', limit: 10 });
  const CustomRow = useSlot('LeaderboardRow');
  const rowStyle = useSlotStyle<StyleProp<ViewStyle>>('leaderboardRow');
  const c = theme.colors;
  if (loading && !board) return <Body muted>{labels.loading}</Body>;
  if (!board || board.entries.length === 0) return <Body muted>{labels.noScoresYet}</Body>;
  return (
    <View style={{ gap: 4 }}>
      {board.entries.map((e, k) => {
        const me = highlightUserRank != null && e.rank === highlightUserRank;
        if (CustomRow) return <CustomRow key={`${e.externalUserId}-${e.rank}`} rank={e.rank} name={e.username ?? e.externalUserId} score={e.score} isYou={me} index={k} />;
        return (
          <FadeSlide key={`${e.externalUserId}-${e.rank}`} from="right" delay={Math.min(k, 8) * 50}>
            <View
              style={[{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingVertical: 9,
                paddingHorizontal: 10,
                borderRadius: theme.radii.md,
                backgroundColor: me ? alpha(c.primary, 0.2) : 'transparent',
                borderWidth: 1,
                borderColor: me ? alpha(c.primary, 0.5) : 'transparent',
              }, rowStyle]}
            >
              <View style={{ width: 30, alignItems: 'center' }}>
                {e.rank <= 3 ? (
                  <Icon name={MEDAL[e.rank - 1]} size={20} />
                ) : (
                  <Text style={[typeStyle(theme, theme.typography.caption), { color: c.textMuted, fontSize: 14 }]}>{e.rank}</Text>
                )}
              </View>
              <Text numberOfLines={1} style={[typeStyle(theme, theme.typography.body), { flex: 1, color: c.text, fontWeight: me ? '700' : '400' }]}>
                {e.username ?? e.externalUserId}
              </Text>
              <Text style={[typeStyle(theme, theme.typography.body), { color: c.text, fontVariant: ['tabular-nums'], fontWeight: '700' }]}>{e.score}</Text>
            </View>
          </FadeSlide>
        );
      })}
    </View>
  );
}

export function ResultView({
  result,
  title,
  gameId,
  session,
  showLeaderboard,
  onPlayAgain,
  onClose,
}: {
  result: CompletionResult;
  title: string;
  gameId?: string;
  session: SessionCredentials | null;
  showLeaderboard: boolean;
  onPlayAgain?: () => void;
  onClose?: () => void;
}) {
  const { theme, labels } = useSage();
  const feedback = useFeedback();
  const CustomHero = useSlot('ResultHero');
  const heroStyle = useSlotStyle<StyleProp<ViewStyle>>('resultHero');
  const c = theme.colors;
  const status = result.status === 'rejected' ? labels.rejected : result.valid ? labels.verified : labels.notRanked;
  const top = result.valid && result.rank === 1;
  // Fire the confetti once the card is on screen.
  const [fire, setFire] = useState(0);
  useEffect(() => {
    if (!result.valid) return;
    const id = setTimeout(() => {
      setFire(1);
      feedback(top ? 'celebrate' : 'success');
    }, 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={{ gap: theme.spacing.lg }}>
      {CustomHero ? (
        <CustomHero gameId={gameId} title={title} score={result.score} rank={result.rank ?? null} durationMs={result.durationMs} valid={result.valid} />
      ) : (
      <Surface gradient="hero" elevation="lg" style={[{ alignItems: 'center', gap: theme.spacing.sm, overflow: 'hidden', paddingVertical: theme.spacing.xl }, heroStyle]}>
        <Confetti fire={fire} />
        <View style={{ width: 64, height: 64, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 34 }}>{top ? '🏆' : gameId ? gameGlyph(gameId) : '⭐'}</Text>
        </View>
        <Text style={[typeStyle(theme, theme.typography.body), { color: alpha(c.onPrimary, 0.85) }]}>{title}</Text>
        <Text style={[typeStyle(theme, theme.typography.caption), { color: c.onPrimary, letterSpacing: 1.5, textTransform: 'uppercase' }]}>{labels.yourScore}</Text>
        <CountUp value={result.score} style={[typeStyle(theme, theme.typography.display), { color: c.onPrimary, fontSize: 60, lineHeight: 66, fontVariant: ['tabular-nums'] }]} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 4 }}>
          {result.rank != null && <Chip label={`${labels.rank} #${result.rank}`} color={c.onPrimary} icon={<Icon name="trophy" size={12} />} />}
          <Chip label={formatDuration(result.durationMs)} color={c.onPrimary} icon={<Icon name="clock" size={12} color={c.onPrimary} />} />
        </View>
        {top && <Text style={[typeStyle(theme, theme.typography.heading), { color: c.onPrimary, marginTop: 4 }]}>{labels.newBest}</Text>}
      </Surface>
      )}

      <View style={{ alignItems: 'center' }}>
        <Chip
          label={status}
          tone={result.valid ? 'success' : result.status === 'rejected' ? 'danger' : 'neutral'}
          icon={result.valid ? <Icon name="check" size={12} color={c.success} /> : undefined}
          style={{ alignSelf: 'center' }}
        />
      </View>

      {showLeaderboard && session && (
        <Card style={{ gap: theme.spacing.sm }}>
          <Heading size={17}>{labels.leaderboard}</Heading>
          <LeaderboardList session={session} highlightUserRank={result.rank} />
        </Card>
      )}

      <View style={{ gap: theme.spacing.sm }}>
        {onPlayAgain && <Button label={labels.playAgain} icon="play" onPress={onPlayAgain} />}
        {onClose && <Button variant="ghost" label={labels.close} onPress={onClose} />}
      </View>
    </View>
  );
}
