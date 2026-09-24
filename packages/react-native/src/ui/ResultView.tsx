import React from 'react';
import { Text, View } from 'react-native';
import { CompletionResult, SessionCredentials } from '@sagegames/types';
import { formatDuration, useLeaderboard, useSage } from '@sagegames/react-headless';
import { Body, Button, Card, font, Heading, Stat } from './primitives';

export function LeaderboardList({ session, highlightUserRank }: { session: SessionCredentials; highlightUserRank?: number | null }) {
  const { theme, labels } = useSage();
  const { board, loading } = useLeaderboard(session, { scope: 'context', limit: 10 });
  const c = theme.colors;
  if (loading && !board) return <Body muted>{labels.loading}</Body>;
  if (!board || board.entries.length === 0) return <Body muted>{labels.noScoresYet}</Body>;
  return (
    <View style={{ gap: 2 }}>
      {board.entries.map((e) => {
        const me = highlightUserRank != null && e.rank === highlightUserRank;
        return (
          <View
            key={`${e.externalUserId}-${e.rank}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 8,
              paddingHorizontal: 10,
              borderRadius: theme.radii.sm,
              backgroundColor: me ? c.cellSelected : 'transparent',
            }}
          >
            <Text style={[{ width: 32, color: e.rank <= 3 ? c.primary : c.textMuted, fontSize: 15 }, font(theme, 'bold')]}>{e.rank}</Text>
            <Text numberOfLines={1} style={[{ flex: 1, color: c.text, fontSize: 15 }, font(theme, me ? 'bold' : 'regular')]}>
              {e.username ?? e.externalUserId}
            </Text>
            <Text style={[{ color: c.text, fontSize: 15, fontVariant: ['tabular-nums'] }, font(theme, 'bold')]}>{e.score}</Text>
          </View>
        );
      })}
    </View>
  );
}

export function ResultView({
  result,
  title,
  session,
  showLeaderboard,
  onPlayAgain,
  onClose,
}: {
  result: CompletionResult;
  title: string;
  session: SessionCredentials | null;
  showLeaderboard: boolean;
  onPlayAgain?: () => void;
  onClose?: () => void;
}) {
  const { theme, labels } = useSage();
  const c = theme.colors;
  const status =
    result.status === 'rejected' ? labels.rejected : result.valid ? labels.verified : labels.notRanked;

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <Card style={{ alignItems: 'center', gap: theme.spacing.md }}>
        <Body muted>{title}</Body>
        <Text style={[{ color: c.text, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' }, font(theme, 'medium')]}>
          {labels.yourScore}
        </Text>
        <Text style={[{ color: c.primary, fontSize: 52, fontVariant: ['tabular-nums'] }, font(theme, 'bold')]}>{result.score}</Text>
        <View style={{ flexDirection: 'row', gap: theme.spacing.xl }}>
          {result.rank != null && <Stat label={labels.rank} value={`#${result.rank}`} align="center" />}
          <Stat label={labels.time} value={formatDuration(result.durationMs)} align="center" />
        </View>
        <Text style={[{ color: result.valid ? c.success : c.textMuted, fontSize: 13, textAlign: 'center' }, font(theme, 'medium')]}>
          {result.valid ? '✓ ' : ''}
          {status}
        </Text>
      </Card>

      {showLeaderboard && session && (
        <Card style={{ gap: theme.spacing.sm }}>
          <Heading size={17}>{labels.leaderboard}</Heading>
          <LeaderboardList session={session} highlightUserRank={result.rank} />
        </Card>
      )}

      <View style={{ gap: theme.spacing.sm }}>
        {onPlayAgain && <Button label={labels.playAgain} onPress={onPlayAgain} />}
        {onClose && <Button variant="ghost" label={labels.close} onPress={onClose} />}
      </View>
    </View>
  );
}
