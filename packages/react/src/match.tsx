import React, { CSSProperties, ReactNode, useEffect } from 'react';
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
  font,
  gradientCss,
  Heading,
  Icon,
  Loading,
  Pop,
  ProgressBar,
  Pulse,
  row,
  SageStyles,
  shadowCss,
  stack,
  Surface,
  typeStyle,
} from './ui';

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
          <div style={row(12, { alignItems: 'center', padding: theme.spacing.lg, background: gradientCss([accent, mix(accent, c.surface, 0.55)]) })}>
            <div style={{ width: 52, height: 52, borderRadius: 16, background: 'rgba(255,255,255,.18)', display: 'grid', placeItems: 'center', fontSize: 28, flex: 'none' }}>
              {plugin ? gameGlyph(plugin.rules.gameId) : '🎮'}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: '#fff', ...typeStyle(theme, theme.typography.title), fontSize: 22 }}>
                {plugin?.title} · {labels.battle}
              </div>
              <div style={{ color: 'rgba(255,255,255,.85)', ...typeStyle(theme, theme.typography.caption), letterSpacing: 0 }}>
                {labels.playersJoinedOf.replace('{n}', String(players.length)).replace('{max}', String(state.match!.maxPlayers))}
              </div>
            </div>
          </div>
          <div style={stack(theme.spacing.md, { padding: theme.spacing.lg })}>
            <Body muted>{plugin?.instructions}</Body>
            <div style={stack(8)}>
              {players.map((p, i) => (
                <FadeSlide key={p.playerId} from="right" delay={i * 50}>
                  <LobbyRow player={p} isYou={p.playerId === state.you} />
                </FadeSlide>
              ))}
            </div>
            <Pulse active={waiting > 0}>
              <div style={{ color: c.textMuted, textAlign: 'center', ...typeStyle(theme, theme.typography.caption), letterSpacing: 0 }}>
                {labels.waitingForPlayers}
                {players.length < state.match!.minPlayers ? ` · ${labels.needMorePlayers.replace('{n}', String(state.match!.minPlayers))}` : ''}
              </div>
            </Pulse>
            {me?.status === 'invited' ? <Button label={labels.readyUp} icon="check" onClick={m.ready} /> : <Body center>{labels.youAreReady}</Body>}
            <Button variant="ghost" label={labels.leave} onClick={() => (m.forfeit(), props.onClose?.())} />
          </div>
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
        <div style={stack(theme.spacing.lg)}>
          <LiveStandings players={state.match!.players} you={state.you} />
          {state.phase === 'waiting' ? (
            <Card style={stack(theme.spacing.sm, { alignItems: 'center' })}>
              <Pulse active>
                <div style={{ fontSize: 36 }}>{me?.status === 'forfeited' ? '👋' : '🏁'}</div>
              </Pulse>
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
        <Card style={stack(theme.spacing.md, { alignItems: 'center' })}>
          <div style={{ fontSize: 36 }}>⏳</div>
          <Body center>{labels.matchCancelled}</Body>
          {props.onClose && <Button variant="ghost" label={labels.close} onClick={props.onClose} style={{ alignSelf: 'stretch' }} />}
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
    <div className={`sg-root ${props.className ?? ''}`} style={{ background: c.background, color: c.text, padding: theme.spacing.lg, ...stack(theme.spacing.md), ...props.style }}>
      <SageStyles />
      {state.reconnecting && (
        <FadeSlide from="top" style={{ alignSelf: 'center' }}>
          <div role="status" style={row(8, { alignItems: 'center', background: c.warning, color: '#1f2937', borderRadius: theme.radii.pill, padding: '6px 14px', ...typeStyle(theme, theme.typography.caption), letterSpacing: 0 })}>
            <Icon name="bolt" size={13} color="#1f2937" />
            {labels.reconnecting}
          </div>
        </FadeSlide>
      )}
      <FadeSlide trigger={state.phase === 'waiting' ? 'playing' : state.phase} from="none">
        {body}
      </FadeSlide>
    </div>
  );
}

function Countdown({ seconds }: { seconds: number | null }) {
  const { theme, labels } = useSage();
  const Custom = useSlot('Countdown');
  const slotStyle = useSlotStyle<CSSProperties>('countdown');
  const feedback = useFeedback();
  useEffect(() => {
    if (seconds !== null) feedback('tap');
  }, [seconds, feedback]);
  if (Custom) return <Custom value={seconds || null} kind="battle" />;
  return (
    <div role="timer" style={stack(theme.spacing.md, { alignItems: 'center', justifyContent: 'center', padding: '80px 0', ...slotStyle })}>
      <div style={{ color: theme.colors.textMuted, ...typeStyle(theme, theme.typography.heading) }}>{labels.startsIn}</div>
      <Pop trigger={seconds}>
        <div
          style={{
            width: 150,
            height: 150,
            borderRadius: 75,
            display: 'grid',
            placeItems: 'center',
            background: gradientCss(theme.gradients.primary),
            boxShadow: shadowCss(theme, 'lg'),
            color: theme.colors.onPrimary,
            ...typeStyle(theme, theme.typography.display),
            fontSize: seconds ? 84 : 44,
          }}
        >
          {seconds ? seconds : labels.go}
        </div>
      </Pop>
    </div>
  );
}

function LobbyRow({ player, isYou }: { player: MatchPlayerView; isYou: boolean }) {
  const { theme, labels } = useSage();
  const slotStyle = useSlotStyle<CSSProperties>('lobbyRow');
  const c = theme.colors;
  const ready = player.status === 'ready';
  const name = player.displayName ?? player.externalUserId;
  const status = !player.connected ? labels.statusOffline : ready ? labels.statusReady : labels.statusInvited;
  return (
    <div
      style={row(10, {
        alignItems: 'center',
        padding: '10px 12px',
        borderRadius: theme.radii.md,
        background: isYou ? alpha(c.primary, 0.14) : c.surfaceAlt,
        border: `1px solid ${isYou ? alpha(c.primary, 0.4) : c.border}`,
        ...slotStyle,
      })}
    >
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        <Avatar name={name} size={36} />
        <span aria-hidden style={{ position: 'absolute', right: -1, bottom: -1, width: 12, height: 12, borderRadius: 6, border: `2px solid ${c.surfaceAlt}`, background: player.connected ? c.success : c.border }} />
      </span>
      <span style={{ flex: 1, color: c.text, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...font(theme, isYou ? 'bold' : 'regular') }}>
        {name}
        {isYou ? ` (${labels.you})` : ''}
      </span>
      <Pop trigger={ready || null} inline>
        <Chip label={status} tone={ready ? 'success' : 'neutral'} icon={ready ? <Icon name="check" size={11} color={c.success} /> : undefined} />
      </Pop>
    </div>
  );
}

function LiveStandings({ players, you }: { players: MatchPlayerView[]; you: string | null }) {
  const { theme, labels } = useSage();
  const c = theme.colors;
  const racing = players.filter((p) => p.status !== 'absent').sort((a, b) => b.progress - a.progress || b.score - a.score);
  return (
    <Card style={stack(10, { padding: theme.spacing.md })}>
      {racing.map((p, i) => {
        const isYou = p.playerId === you;
        const name = p.displayName ?? p.externalUserId;
        return (
          <div key={p.playerId} style={row(10, { alignItems: 'center' })}>
            <span style={{ width: 16, color: i === 0 ? c.warning : c.textMuted, ...typeStyle(theme, theme.typography.caption), letterSpacing: 0 }}>{i + 1}</span>
            <Avatar name={name} size={28} />
            <div style={stack(4, { flex: 1, minWidth: 0 })}>
              <div style={row(8, { justifyContent: 'space-between', fontSize: 13 })}>
                <span style={{ color: c.text, ...font(theme, isYou ? 'bold' : 'medium') }}>
                  {name}
                  {isYou ? ` (${labels.you})` : ''}
                  {p.status === 'forfeited' ? ` · ${labels.forfeited}` : ''}
                </span>
                <CountUp value={p.score} duration={300} style={{ color: c.text, ...font(theme, 'bold') }} />
              </div>
              <ProgressBar fraction={p.progress} color={isYou ? undefined : c.textMuted} height={6} />
            </div>
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
    <div style={stack(theme.spacing.lg)}>
      <Surface gradient="hero" elevation="lg" style={stack(theme.spacing.md, { position: 'relative', alignItems: 'center', textAlign: 'center', overflow: 'hidden' })}>
        <Confetti fire={won ? 1 : null} />
        <div style={{ color: c.onPrimary, ...typeStyle(theme, theme.typography.title), fontSize: 26 }}>{won ? labels.youWon : `${labels.youPlaced} #${mine?.rank ?? '–'}`}</div>
        <div style={row(10, { alignItems: 'flex-end', justifyContent: 'center' })}>
          {podium.map((s, i) => (
            <FadeSlide key={s.playerId} delay={200 + i * 120}>
              <div style={stack(6, { alignItems: 'center', width: 86 })}>
                <Avatar name={s.displayName ?? s.externalUserId} size={s.rank === 1 ? 48 : 38} />
                <span style={{ color: c.onPrimary, maxWidth: 86, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...typeStyle(theme, theme.typography.caption), letterSpacing: 0 }}>
                  {s.displayName ?? s.externalUserId}
                </span>
                <div style={{ width: '100%', height: heights[s.rank] ?? 40, borderRadius: '12px 12px 0 0', background: 'rgba(255,255,255,.2)', display: 'flex', justifyContent: 'center', paddingTop: 6 }}>
                  <Icon name={medal(s.rank)} size={24} />
                </div>
              </div>
            </FadeSlide>
          ))}
        </div>
      </Surface>
      <Card style={stack(4)}>
        <Heading size={17}>{labels.standings}</Heading>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, ...stack(2) }}>
          {standings.map((s, k) => {
            const isYou = s.playerId === you;
            return (
              <li key={s.playerId}>
                <FadeSlide from="right" delay={k * 50}>
                  <div style={row(10, { alignItems: 'center', padding: '10px', borderRadius: theme.radii.md, background: isYou ? alpha(c.primary, 0.2) : 'transparent' })}>
                    <span style={{ width: 28, display: 'grid', placeItems: 'center', color: c.textMuted, ...font(theme, 'bold') }}>{s.rank <= 3 ? <Icon name={medal(s.rank)} size={20} /> : s.rank}</span>
                    <span style={{ flex: 1, ...stack(2) }}>
                      <span style={{ color: c.text, fontSize: 15, ...font(theme, isYou ? 'bold' : 'medium') }}>
                        {s.displayName ?? s.externalUserId}
                        {isYou ? ` (${labels.you})` : ''}
                      </span>
                      <span style={{ color: c.textMuted, fontSize: 12 }}>
                        {s.status === 'forfeited' ? labels.forfeited : s.completed && s.finishedMs !== null ? formatDuration(s.finishedMs) : `${Math.round(s.progress * 100)}%`}
                      </span>
                    </span>
                    <span style={{ color: c.text, fontVariantNumeric: 'tabular-nums', ...typeStyle(theme, theme.typography.heading) }}>{s.score}</span>
                  </div>
                </FadeSlide>
              </li>
            );
          })}
        </ol>
      </Card>
      {onClose && <Button variant="ghost" label={labels.close} onClick={onClose} />}
    </div>
  );
}
