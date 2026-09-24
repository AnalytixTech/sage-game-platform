import React, { ReactNode } from 'react';
import { ScrollView, StyleProp, Text, View, ViewStyle } from 'react-native';
import { MatchPlayerView, MatchStanding } from '@sagegames/types';
import { GameRuntime, MatchSeat } from '@sagegames/core';
import { formatDuration, GamePlugin, useMatch, useRuntimeSnapshot, useSage } from '@sagegames/react-headless';
import { Body, Button, Card, font, Heading, Loading, ProgressBar } from './ui/primitives';

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

  let body: ReactNode = null;
  switch (state.phase) {
    case 'connecting':
      body = <Loading label={labels.connecting} />;
      break;
    case 'lobby': {
      const players = state.match!.players.filter((p) => p.status !== 'absent');
      body = (
        <Card style={{ gap: theme.spacing.md }}>
          <Heading size={22}>
            {plugin?.title} · {labels.battle}
          </Heading>
          <Body muted>{plugin?.instructions}</Body>
          <Text style={[{ color: c.textMuted, fontSize: 13 }, font(theme, 'medium')]}>
            {labels.waitingForPlayers} · {labels.playersJoinedOf.replace('{n}', String(players.length)).replace('{max}', String(state.match!.maxPlayers))}
          </Text>
          <View style={{ gap: 6 }}>
            {players.map((p) => (
              <LobbyRow key={p.playerId} player={p} isYou={p.playerId === state.you} />
            ))}
          </View>
          {players.length < state.match!.minPlayers && (
            <Body muted style={{ fontSize: 13 }}>
              {labels.needMorePlayers.replace('{n}', String(state.match!.minPlayers))}
            </Body>
          )}
          {me?.status === 'invited' ? <Button label={labels.readyUp} onPress={m.ready} /> : <Body center>{labels.youAreReady}</Body>}
          <Button variant="ghost" label={labels.leave} onPress={() => (m.forfeit(), props.onClose?.())} />
        </Card>
      );
      break;
    }
    case 'countdown':
      body = (
        <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: theme.spacing.md }}>
          <Text style={[{ color: c.textMuted, fontSize: 16 }, font(theme, 'medium')]}>{labels.startsIn}</Text>
          <Text style={[{ color: c.primary, fontSize: 96, fontVariant: ['tabular-nums'] }, font(theme, 'bold')]}>
            {m.secondsToStart ? m.secondsToStart : labels.go}
          </Text>
        </View>
      );
      break;
    case 'playing':
    case 'waiting':
      body = (
        <View style={{ gap: theme.spacing.lg }}>
          <LiveStandings players={state.match!.players} you={state.you} />
          {state.phase === 'waiting' ? (
            <Card>
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
        <Card style={{ gap: theme.spacing.md }}>
          <Body center>{labels.matchCancelled}</Body>
          {props.onClose && <Button variant="ghost" label={labels.close} onPress={props.onClose} />}
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
        <View style={{ backgroundColor: c.warning, borderRadius: theme.radii.sm, padding: 8 }}>
          <Text style={[{ color: '#1f2937', textAlign: 'center', fontSize: 13 }, font(theme, 'medium')]}>{labels.reconnecting}</Text>
        </View>
      )}
      {body}
    </ScrollView>
  );
}

function LobbyRow({ player, isYou }: { player: MatchPlayerView; isYou: boolean }) {
  const { theme, labels } = useSage();
  const c = theme.colors;
  const ready = player.status === 'ready';
  const status = !player.connected ? labels.statusOffline : ready ? labels.statusReady : labels.statusInvited;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: theme.radii.md,
        backgroundColor: isYou ? c.cellPeer : c.surfaceAlt,
      }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: player.connected ? c.success : c.border }} />
      <Text numberOfLines={1} style={[{ flex: 1, color: c.text, fontSize: 15 }, font(theme, isYou ? 'bold' : 'regular')]}>
        {player.displayName ?? player.externalUserId}
        {isYou ? ` (${labels.you})` : ''}
      </Text>
      <Text style={[{ color: ready ? c.success : c.textMuted, fontSize: 13 }, font(theme, 'medium')]}>{status}</Text>
    </View>
  );
}

/** Everyone's live progress during the race. */
function LiveStandings({ players, you }: { players: MatchPlayerView[]; you: string | null }) {
  const { theme, labels } = useSage();
  const c = theme.colors;
  const racing = players
    .filter((p) => p.status !== 'absent')
    .sort((a, b) => b.progress - a.progress || b.score - a.score);
  return (
    <Card style={{ gap: 8, paddingVertical: theme.spacing.md }}>
      {racing.map((p) => {
        const isYou = p.playerId === you;
        return (
          <View key={p.playerId} style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text numberOfLines={1} style={[{ flex: 1, color: c.text, fontSize: 13 }, font(theme, isYou ? 'bold' : 'medium')]}>
                {p.displayName ?? p.externalUserId}
                {isYou ? ` (${labels.you})` : ''}
                {p.status === 'forfeited' ? ` · ${labels.forfeited}` : ''}
              </Text>
              <Text style={[{ color: c.textMuted, fontSize: 13, fontVariant: ['tabular-nums'] }, font(theme, 'bold')]}>{p.score}</Text>
            </View>
            <ProgressBar fraction={p.progress} color={isYou ? c.primary : c.textMuted} />
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
  runtime: GameRuntime<any, any, any, any>;
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
  const c = theme.colors;
  const mine = standings.find((s) => s.playerId === you);
  const medal = (rank: number) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}`);
  return (
    <View style={{ gap: theme.spacing.lg }}>
      <Card style={{ alignItems: 'center', gap: theme.spacing.sm }}>
        <Text style={{ fontSize: 48 }}>{mine?.rank === 1 ? '🏆' : medal(mine?.rank ?? 0)}</Text>
        <Heading size={24}>{mine?.rank === 1 ? labels.youWon : `${labels.youPlaced} #${mine?.rank ?? '–'}`}</Heading>
      </Card>
      <Card style={{ gap: 4 }}>
        <Heading size={17}>{labels.standings}</Heading>
        {standings.map((s) => {
          const isYou = s.playerId === you;
          return (
            <View
              key={s.playerId}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 10,
                paddingHorizontal: 10,
                borderRadius: theme.radii.sm,
                backgroundColor: isYou ? c.cellSelected : 'transparent',
                gap: 10,
              }}
            >
              <Text style={{ width: 32, fontSize: 18, textAlign: 'center' }}>{medal(s.rank)}</Text>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={[{ color: c.text, fontSize: 15 }, font(theme, isYou ? 'bold' : 'medium')]}>
                  {s.displayName ?? s.externalUserId}
                  {isYou ? ` (${labels.you})` : ''}
                </Text>
                <Text style={[{ color: c.textMuted, fontSize: 12 }, font(theme, 'regular')]}>
                  {s.status === 'forfeited' ? labels.forfeited : s.completed && s.finishedMs !== null ? formatDuration(s.finishedMs) : `${Math.round(s.progress * 100)}%`}
                </Text>
              </View>
              <Text style={[{ color: c.text, fontSize: 16, fontVariant: ['tabular-nums'] }, font(theme, 'bold')]}>{s.score}</Text>
            </View>
          );
        })}
      </Card>
      {onClose && <Button variant="ghost" label={labels.close} onPress={onClose} />}
    </View>
  );
}
