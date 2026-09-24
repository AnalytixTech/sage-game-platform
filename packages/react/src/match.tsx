import React, { CSSProperties, ReactNode } from 'react';
import { MatchPlayerView, MatchStanding } from '@sagegames/types';
import { MatchSeat, PlayableRuntime } from '@sagegames/core';
import { formatDuration, GamePlugin, useMatch, useRuntimeSnapshot, useSage } from '@sagegames/react-headless';
import { Body, Button, Card, font, Heading, Loading, ProgressBar, row, SageStyles, stack } from './ui';

export interface MatchLauncherProps {
  /** Your seat in the match (from your backend)… */
  seat?: MatchSeat;
  /** …or a function that asks your backend for it. */
  getSeat?: () => Promise<MatchSeat>;
  onFinished?: (standings: MatchStanding[]) => void;
  onClose?: () => void;
  className?: string;
  style?: CSSProperties;
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
        <Card style={stack(theme.spacing.md)}>
          <Heading size={22}>
            {plugin?.title} · {labels.battle}
          </Heading>
          <Body muted>{plugin?.instructions}</Body>
          <div style={{ color: c.textMuted, fontSize: 13, ...font(theme, 'medium') }}>
            {labels.waitingForPlayers} ·{' '}
            {labels.playersJoinedOf.replace('{n}', String(players.length)).replace('{max}', String(state.match!.maxPlayers))}
          </div>
          <div style={stack(6)}>
            {players.map((p) => (
              <LobbyRow key={p.playerId} player={p} isYou={p.playerId === state.you} />
            ))}
          </div>
          {players.length < state.match!.minPlayers && (
            <Body muted style={{ fontSize: 13 }}>
              {labels.needMorePlayers.replace('{n}', String(state.match!.minPlayers))}
            </Body>
          )}
          {me?.status === 'invited' ? <Button label={labels.readyUp} onClick={m.ready} /> : <Body center>{labels.youAreReady}</Body>}
          <Button variant="ghost" label={labels.leave} onClick={() => (m.forfeit(), props.onClose?.())} />
        </Card>
      );
      break;
    }
    case 'countdown':
      body = (
        <div role="timer" style={stack(theme.spacing.md, { alignItems: 'center', justifyContent: 'center', padding: '80px 0' })}>
          <div style={{ color: c.textMuted, fontSize: 16, ...font(theme, 'medium') }}>{labels.startsIn}</div>
          <div style={{ color: c.primary, fontSize: 96, lineHeight: 1, fontVariantNumeric: 'tabular-nums', ...font(theme, 'bold') }}>
            {m.secondsToStart ? m.secondsToStart : labels.go}
          </div>
        </div>
      );
      break;
    case 'playing':
    case 'waiting':
      body = (
        <div style={stack(theme.spacing.lg)}>
          <LiveStandings players={state.match!.players} you={state.you} />
          {state.phase === 'waiting' ? (
            <Card>
              <Body center>{me?.status === 'forfeited' ? labels.youForfeited : labels.youFinished}</Body>
            </Card>
          ) : (
            state.runtime && plugin && <RaceView runtime={state.runtime} plugin={plugin} />
          )}
          {state.phase === 'playing' && <Button compact variant="ghost" label={labels.leave} onClick={m.forfeit} />}
        </div>
      );
      break;
    case 'finished':
      body = <FinalStandings standings={state.standings ?? []} you={state.you} onClose={props.onClose} />;
      break;
    case 'cancelled':
      body = (
        <Card style={stack(theme.spacing.md)}>
          <Body center>{labels.matchCancelled}</Body>
          {props.onClose && <Button variant="ghost" label={labels.close} onClick={props.onClose} />}
        </Card>
      );
      break;
    case 'error':
      body = (
        <Card style={stack(theme.spacing.md)}>
          <Body center>{state.error?.message}</Body>
          {state.error?.retryable && <Button label={labels.tryAgain} onClick={m.retry} />}
          {props.onClose && <Button variant="ghost" label={labels.close} onClick={props.onClose} />}
        </Card>
      );
      break;
  }

  return (
    <div
      className={`sg-root ${props.className ?? ''}`}
      style={{ background: c.background, color: c.text, padding: theme.spacing.lg, ...stack(theme.spacing.md), ...props.style }}
    >
      <SageStyles />
      {state.reconnecting && (
        <div role="status" style={{ background: c.warning, color: '#1f2937', borderRadius: theme.radii.sm, padding: 8, textAlign: 'center', fontSize: 13, ...font(theme, 'medium') }}>
          {labels.reconnecting}
        </div>
      )}
      {body}
    </div>
  );
}

function LobbyRow({ player, isYou }: { player: MatchPlayerView; isYou: boolean }) {
  const { theme, labels } = useSage();
  const c = theme.colors;
  const ready = player.status === 'ready';
  const status = !player.connected ? labels.statusOffline : ready ? labels.statusReady : labels.statusInvited;
  return (
    <div style={row(10, { alignItems: 'center', padding: '10px 12px', borderRadius: theme.radii.md, background: isYou ? c.cellPeer : c.surfaceAlt })}>
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: 4, background: player.connected ? c.success : c.border, flex: 'none' }} />
      <span style={{ flex: 1, color: c.text, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...font(theme, isYou ? 'bold' : 'regular') }}>
        {player.displayName ?? player.externalUserId}
        {isYou ? ` (${labels.you})` : ''}
      </span>
      <span style={{ color: ready ? c.success : c.textMuted, fontSize: 13, ...font(theme, 'medium') }}>{status}</span>
    </div>
  );
}

function LiveStandings({ players, you }: { players: MatchPlayerView[]; you: string | null }) {
  const { theme, labels } = useSage();
  const c = theme.colors;
  const racing = players.filter((p) => p.status !== 'absent').sort((a, b) => b.progress - a.progress || b.score - a.score);
  return (
    <Card style={stack(8, { padding: theme.spacing.md })}>
      {racing.map((p) => {
        const isYou = p.playerId === you;
        return (
          <div key={p.playerId} style={stack(4)}>
            <div style={row(8, { justifyContent: 'space-between', fontSize: 13 })}>
              <span style={{ color: c.text, ...font(theme, isYou ? 'bold' : 'medium') }}>
                {p.displayName ?? p.externalUserId}
                {isYou ? ` (${labels.you})` : ''}
                {p.status === 'forfeited' ? ` · ${labels.forfeited}` : ''}
              </span>
              <span style={{ color: c.textMuted, fontVariantNumeric: 'tabular-nums', ...font(theme, 'bold') }}>{p.score}</span>
            </div>
            <ProgressBar fraction={p.progress} color={isYou ? c.primary : c.textMuted} />
          </div>
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
  const c = theme.colors;
  const mine = standings.find((s) => s.playerId === you);
  const medal = (rank: number) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}`);
  return (
    <div style={stack(theme.spacing.lg)}>
      <Card style={stack(theme.spacing.sm, { alignItems: 'center', textAlign: 'center' })}>
        <div style={{ fontSize: 48 }}>{mine?.rank === 1 ? '🏆' : medal(mine?.rank ?? 0)}</div>
        <Heading size={24}>{mine?.rank === 1 ? labels.youWon : `${labels.youPlaced} #${mine?.rank ?? '–'}`}</Heading>
      </Card>
      <Card style={stack(4)}>
        <Heading size={17}>{labels.standings}</Heading>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, ...stack(2) }}>
          {standings.map((s) => {
            const isYou = s.playerId === you;
            return (
              <li key={s.playerId} style={row(10, { alignItems: 'center', padding: '10px', borderRadius: theme.radii.sm, background: isYou ? c.cellSelected : 'transparent' })}>
                <span style={{ width: 32, fontSize: 18, textAlign: 'center' }}>{medal(s.rank)}</span>
                <span style={{ flex: 1, ...stack(2) }}>
                  <span style={{ color: c.text, fontSize: 15, ...font(theme, isYou ? 'bold' : 'medium') }}>
                    {s.displayName ?? s.externalUserId}
                    {isYou ? ` (${labels.you})` : ''}
                  </span>
                  <span style={{ color: c.textMuted, fontSize: 12 }}>
                    {s.status === 'forfeited'
                      ? labels.forfeited
                      : s.completed && s.finishedMs !== null
                        ? formatDuration(s.finishedMs)
                        : `${Math.round(s.progress * 100)}%`}
                  </span>
                </span>
                <span style={{ color: c.text, fontSize: 16, fontVariantNumeric: 'tabular-nums', ...font(theme, 'bold') }}>{s.score}</span>
              </li>
            );
          })}
        </ol>
      </Card>
      {onClose && <Button variant="ghost" label={labels.close} onClick={onClose} />}
    </div>
  );
}
