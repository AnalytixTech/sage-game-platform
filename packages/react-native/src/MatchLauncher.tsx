import React, { ReactNode, useEffect } from 'react';
import { ScrollView, StyleProp, Text, View, ViewStyle } from 'react-native';
import { MatchPlayerView, MatchStanding } from '@sagegames/types';
import { MatchSeat, PlayableRuntime } from '@sagegames/core';
import { alpha, formatDuration, gameAccent, gameGlyph, GamePlugin, mix, useFeedback, useMatch, useRuntimeSnapshot, useSage, useSlot, useSlotStyle } from '@sagegames/react-headless';
import {
  Avatar,
  Body,
  Button,
  Card,
  Chip,
  Confetti,
  CountUp,
  FadeSlide,
  gradientStyle,
  Heading,
  Icon,
  Loading,
  Pop,
  ProgressBar,
  Pulse,
  shadowStyle,
  Surface,
  typeStyle,
} from './ui/primitives';

export interface MatchLauncherProps {
  /** Your seat in the match (from your backend)… */
  seat?: MatchSeat;
  /** …or a function that asks your backend for it. */
  getSeat?: () => Promise<MatchSeat>;
  onFinished?: (standings: MatchStanding[]) => void;
  onClose?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * An online battle: everyone gets the same puzzle, races live, and sees the standings.
 * The server applies every move, so the result can't be faked.
 */
export function MatchLauncher(props: MatchLauncherProps) {
  const { theme, labels } = useSage();
  const m = useMatch({ seat: props.seat, getSeat: props.getSeat, onFinished: props.onFinished });
  const { state, plugin, me } = m;
  const c = theme.colors;
  const accent = plugin ? gameAccent(theme, plugin.rules.gameId) : c.primary;

  let body: ReactNode = null;
  switch (state.phase) {
    case 'connecting':
      body = <Loading label={labels.connecting} />;
      break;
    case 'lobby': {
      const players = state.match!.players.filter((p) => p.status !== 'absent');
      const waiting = players.filter((p) => p.status !== 'ready').length;
      body = (
        <Surface padded={false} elevation="lg" style={{ overflow: 'hidden' }}>
          <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: theme.spacing.lg }, gradientStyle([accent, mix(accent, c.surface, 0.55)])]}>
            <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 28 }}>{plugin ? gameGlyph(plugin.rules.gameId) : '🎮'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[typeStyle(theme, theme.typography.title), { color: '#ffffff', fontSize: 22 }]}>
                {plugin?.title} · {labels.battle}
              </Text>
              <Text style={[typeStyle(theme, theme.typography.caption), { color: 'rgba(255,255,255,0.85)', letterSpacing: 0 }]}>
                {labels.playersJoinedOf.replace('{n}', String(players.length)).replace('{max}', String(state.match!.maxPlayers))}
              </Text>
            </View>
          </View>
          <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
            <Body muted>{plugin?.instructions}</Body>
            <View style={{ gap: 8 }}>
              {players.map((p, i) => (
                <FadeSlide key={p.playerId} from="right" delay={i * 50}>
                  <LobbyRow player={p} isYou={p.playerId === state.you} />
                </FadeSlide>
              ))}
            </View>
            <Pulse active={waiting > 0}>
              <Text style={[typeStyle(theme, theme.typography.caption), { color: c.textMuted, textAlign: 'center', letterSpacing: 0 }]}>
                {labels.waitingForPlayers}
                {players.length < state.match!.minPlayers ? ` · ${labels.needMorePlayers.replace('{n}', String(state.match!.minPlayers))}` : ''}
              </Text>
            </Pulse>
            {me?.status === 'invited' ? <Button label={labels.readyUp} icon="check" onPress={m.ready} /> : <Body center>{labels.youAreReady}</Body>}
            <Button variant="ghost" label={labels.leave} onPress={() => (m.forfeit(), props.onClose?.())} />
          </View>
        </Surface>
      );
      break;
    }
    case 'countdown':
      body = <Countdown seconds={m.secondsToStart} />;
      break;
    case 'playing':
    case 'waiting':
      body = (
        <View style={{ gap: theme.spacing.lg }}>
          <LiveStandings players={state.match!.players} you={state.you} />
          {state.phase === 'waiting' ? (
            <Card style={{ alignItems: 'center', gap: theme.spacing.sm }}>
              <Pulse active>
                <Text style={{ fontSize: 36 }}>{me?.status === 'forfeited' ? '👋' : '🏁'}</Text>
              </Pulse>
              <Body center>{me?.status === 'forfeited' ? labels.youForfeited : labels.youFinished}</Body>
            </Card>
          ) : (
            state.runtime && plugin && <RaceView runtime={state.runtime} plugin={plugin} />
          )}
          {state.phase === 'playing' && <Button compact variant="ghost" label={labels.leave} onPress={m.forfeit} />}
        </View>
      );
      break;
    case 'finished':
      body = <FinalStandings standings={state.standings ?? []} you={state.you} onClose={props.onClose} />;
      break;
    case 'cancelled':
      body = (
        <Card style={{ gap: theme.spacing.md, alignItems: 'center' }}>
          <Text style={{ fontSize: 36 }}>⏳</Text>
          <Body center>{labels.matchCancelled}</Body>
          {props.onClose && <Button variant="ghost" label={labels.close} onPress={props.onClose} style={{ alignSelf: 'stretch' }} />}
        </Card>
      );
      break;
    case 'error':
      body = (
        <Card style={{ gap: theme.spacing.md }}>
          <Body center>{state.error?.message}</Body>
          {state.error?.retryable && <Button label={labels.tryAgain} onPress={m.retry} />}
          {props.onClose && <Button variant="ghost" label={labels.close} onPress={props.onClose} />}
        </Card>
      );
      break;
  }

  return (
    <ScrollView
      style={[{ flex: 1, backgroundColor: c.background }, props.style]}
      contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.xl * 2, gap: theme.spacing.md }}
      scrollEnabled={state.phase !== 'playing'}
    >
      {state.reconnecting && (
        <FadeSlide from="top">
          <View style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.warning, borderRadius: theme.radii.pill, paddingVertical: 6, paddingHorizontal: 14 }}>
            <Icon name="bolt" size={13} color="#1f2937" />
            <Text style={[typeStyle(theme, theme.typography.caption), { color: '#1f2937', letterSpacing: 0 }]}>{labels.reconnecting}</Text>
          </View>
        </FadeSlide>
      )}
      <FadeSlide trigger={state.phase === 'waiting' ? 'playing' : state.phase} from="none">
        {body}
      </FadeSlide>
    </ScrollView>
  );
}

function Countdown({ seconds }: { seconds: number | null }) {
  const { theme, labels } = useSage();
  const Custom = useSlot('Countdown');
  const slotStyle = useSlotStyle<StyleProp<ViewStyle>>('countdown');
  const feedback = useFeedback();
  useEffect(() => {
    if (seconds !== null) feedback('tap');
  }, [seconds, feedback]);
  if (Custom) return <Custom value={seconds || null} kind="battle" />;
  return (
    <View accessibilityRole="timer" style={[{ alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: theme.spacing.md }, slotStyle]}>
      <Text style={[typeStyle(theme, theme.typography.heading), { color: theme.colors.textMuted }]}>{labels.startsIn}</Text>
      <Pop trigger={seconds} peak={1.35}>
        <View style={[{ width: 150, height: 150, borderRadius: 75, alignItems: 'center', justifyContent: 'center' }, gradientStyle(theme.gradients.primary), shadowStyle(theme, 'lg')]}>
          <Text style={[typeStyle(theme, theme.typography.display), { color: theme.colors.onPrimary, fontSize: seconds ? 84 : 44, lineHeight: seconds ? 92 : 52 }]}>
            {seconds ? seconds : labels.go}
          </Text>
        </View>
      </Pop>
    </View>
  );
}

function LobbyRow({ player, isYou }: { player: MatchPlayerView; isYou: boolean }) {
  const { theme, labels } = useSage();
  const slotStyle = useSlotStyle<StyleProp<ViewStyle>>('lobbyRow');
  const c = theme.colors;
  const ready = player.status === 'ready';
  const name = player.displayName ?? player.externalUserId;
  const status = !player.connected ? labels.statusOffline : ready ? labels.statusReady : labels.statusInvited;
  return (
    <View
      style={[{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: theme.radii.md,
        backgroundColor: isYou ? alpha(c.primary, 0.14) : c.surfaceAlt,
        borderWidth: 1,
        borderColor: isYou ? alpha(c.primary, 0.4) : c.border,
      }, slotStyle]}
    >
      <View>
        <Avatar name={name} size={36} />
        <View style={{ position: 'absolute', right: -1, bottom: -1, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: c.surfaceAlt, backgroundColor: player.connected ? c.success : c.border }} />
      </View>
      <Text numberOfLines={1} style={[typeStyle(theme, theme.typography.body), { flex: 1, color: c.text, fontWeight: isYou ? '700' : '400' }]}>
        {name}
        {isYou ? ` (${labels.you})` : ''}
      </Text>
      <Pop trigger={ready || null} peak={1.2}>
        <Chip label={status} tone={ready ? 'success' : 'neutral'} icon={ready ? <Icon name="check" size={11} color={c.success} /> : undefined} />
      </Pop>
    </View>
  );
}

/** Everyone's live progress during the race. */
function LiveStandings({ players, you }: { players: MatchPlayerView[]; you: string | null }) {
  const { theme, labels } = useSage();
  const c = theme.colors;
  const racing = players.filter((p) => p.status !== 'absent').sort((a, b) => b.progress - a.progress || b.score - a.score);
  return (
    <Card style={{ gap: 10, paddingVertical: theme.spacing.md }}>
      {racing.map((p, i) => {
        const isYou = p.playerId === you;
        const name = p.displayName ?? p.externalUserId;
        return (
          <View key={p.playerId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={[typeStyle(theme, theme.typography.caption), { width: 16, color: i === 0 ? c.warning : c.textMuted, letterSpacing: 0 }]}>{i + 1}</Text>
            <Avatar name={name} size={28} />
            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text numberOfLines={1} style={[typeStyle(theme, theme.typography.caption), { flex: 1, color: c.text, letterSpacing: 0, fontSize: 13, fontWeight: isYou ? '700' : '500' }]}>
                  {name}
                  {isYou ? ` (${labels.you})` : ''}
                  {p.status === 'forfeited' ? ` · ${labels.forfeited}` : ''}
                </Text>
                <CountUp value={p.score} duration={300} style={[typeStyle(theme, theme.typography.caption), { color: c.text, fontVariant: ['tabular-nums'], letterSpacing: 0, fontSize: 13 }]} />
              </View>
              <ProgressBar fraction={p.progress} color={isYou ? undefined : c.textMuted} height={6} />
            </View>
          </View>
        );
      })}
    </Card>
  );
}

function RaceView({
  runtime,
  plugin,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runtime: PlayableRuntime<any>;
  plugin: GamePlugin;
}) {
  const { theme, labels } = useSage();
  const snap = useRuntimeSnapshot(runtime);
  const GameView = plugin.View;
  return (
    <GameView
      state={snap.state}
      dispatch={(type, payload) => runtime.dispatch(type, payload)}
      elapsedMs={snap.elapsedMs}
      paused={false}
      ended={snap.ended}
      theme={theme}
      labels={labels}
    />
  );
}

function FinalStandings({ standings, you, onClose }: { standings: MatchStanding[]; you: string | null; onClose?: () => void }) {
  const { theme, labels } = useSage();
  const feedback = useFeedback();
  const c = theme.colors;
  const mine = standings.find((s) => s.playerId === you);
  const won = mine?.rank === 1;
  useEffect(() => {
    feedback(won ? 'celebrate' : 'success');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const podium = [standings[1], standings[0], standings[2]].filter(Boolean) as MatchStanding[];
  const heights: Record<number, number> = { 1: 96, 2: 70, 3: 52 };
  const medal = (rank: number) => (rank === 1 ? 'medal1' : rank === 2 ? 'medal2' : 'medal3') as 'medal1' | 'medal2' | 'medal3';

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <Surface gradient="hero" elevation="lg" style={{ alignItems: 'center', gap: theme.spacing.md, overflow: 'hidden' }}>
        <Confetti fire={won ? 1 : null} />
        <Text style={[typeStyle(theme, theme.typography.title), { color: c.onPrimary, fontSize: 26 }]}>
          {won ? labels.youWon : `${labels.youPlaced} #${mine?.rank ?? '–'}`}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 10 }}>
          {podium.map((s, i) => (
            <FadeSlide key={s.playerId} delay={200 + i * 120} style={{ alignItems: 'center', gap: 6, width: 86 }}>
              <Avatar name={s.displayName ?? s.externalUserId} size={s.rank === 1 ? 48 : 38} />
              <Text numberOfLines={1} style={[typeStyle(theme, theme.typography.caption), { color: c.onPrimary, letterSpacing: 0 }]}>
                {s.displayName ?? s.externalUserId}
              </Text>
              <View style={{ width: '100%', height: heights[s.rank] ?? 40, borderTopLeftRadius: 12, borderTopRightRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', paddingTop: 6 }}>
                <Icon name={medal(s.rank)} size={24} />
              </View>
            </FadeSlide>
          ))}
        </View>
      </Surface>
      <Card style={{ gap: 4 }}>
        <Heading size={17}>{labels.standings}</Heading>
        {standings.map((s, k) => {
          const isYou = s.playerId === you;
          return (
            <FadeSlide key={s.playerId} from="right" delay={k * 50}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 10,
                  paddingHorizontal: 10,
                  borderRadius: theme.radii.md,
                  backgroundColor: isYou ? alpha(c.primary, 0.2) : 'transparent',
                  gap: 10,
                }}
              >
                <View style={{ width: 28, alignItems: 'center' }}>
                  {s.rank <= 3 ? <Icon name={medal(s.rank)} size={20} /> : <Text style={[typeStyle(theme, theme.typography.caption), { color: c.textMuted }]}>{s.rank}</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={[typeStyle(theme, theme.typography.body), { color: c.text, fontWeight: isYou ? '700' : '500' }]}>
                    {s.displayName ?? s.externalUserId}
                    {isYou ? ` (${labels.you})` : ''}
                  </Text>
                  <Text style={[typeStyle(theme, theme.typography.caption), { color: c.textMuted, letterSpacing: 0 }]}>
                    {s.status === 'forfeited' ? labels.forfeited : s.completed && s.finishedMs !== null ? formatDuration(s.finishedMs) : `${Math.round(s.progress * 100)}%`}
                  </Text>
                </View>
                <Text style={[typeStyle(theme, theme.typography.heading), { color: c.text, fontVariant: ['tabular-nums'] }]}>{s.score}</Text>
              </View>
            </FadeSlide>
          );
        })}
      </Card>
      {onClose && <Button variant="ghost" label={labels.close} onPress={onClose} />}
    </View>
  );
}
