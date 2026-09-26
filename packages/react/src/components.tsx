import React, { CSSProperties, ReactNode, useEffect, useState } from 'react';
import { CompletionResult, Game, GameCategory, SessionCredentials } from '@sagegames/types';
import { PlayableRuntime } from '@sagegames/core';
import {
  alpha,
  formatClock,
  formatDuration,
  gameAccent,
  gameGlyph,
  GamePlugin,
  mix,
  RenderOverride,
  useFeedback,
  useSlot,
  useSlotStyle,
  useGames,
  useLauncher,
  UseLauncherOptions,
  useLeaderboard,
  useLocalGame,
  useRuntimeSnapshot,
  useSage,
} from '@sagegames/react-headless';
import {
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
  IconButton,
  Loading,
  Pop,
  row,
  SageStyles,
  shadowCss,
  stack,
  Surface,
  typeStyle,
  useMotion,
} from './ui';

export interface GameLauncherProps extends UseLauncherOptions {
  onClose?: () => void;
  /** Show the chat/group leaderboard on the result screen (default true). */
  showLeaderboard?: boolean;
  renderHeader?: (info: { title: string; score: number; elapsedMs: number; paused: boolean }) => ReactNode;
  hideChrome?: boolean;
  /** 3-2-1 before timed games (Quiz, Word Rush). Default true. */
  showCountdown?: boolean;
  /** Replace or wrap the intro card (receives the default element). */
  renderIntro?: RenderOverride<{ plugin: GamePlugin; play: () => void }>;
  /** Replace or wrap the result screen. */
  renderResult?: RenderOverride<{ result: CompletionResult; playAgain?: () => void; close?: () => void }>;
  /** Replace or wrap the "Checking your score..." screen. */
  renderSubmitting?: RenderOverride<{ attempt: number }>;
  /** Replace or wrap the error card. */
  renderError?: RenderOverride<{ message: string; retry?: () => void; close?: () => void }>;
  className?: string;
  style?: CSSProperties;
}

/**
 * Plays one SageGames session: intro → game → verified result, with pause, quit, retries and
 * a chat/group leaderboard. Give it `getSession` (preferred, enables "Play again") or `session`.
 */
export function GameLauncher(props: GameLauncherProps) {
  const { theme, labels } = useSage();
  const launcher = useLauncher(props);
  const { state, plugin } = launcher;
  const c = theme.colors;
  const [counting, setCounting] = useState(false);

  // Pause when the tab is hidden (games that allow pausing).
  useEffect(() => {
    const onVisibility = () => document.visibilityState === 'hidden' && launcher.pause();
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launcher.pause]);

  const timed = !!plugin && !plugin.rules.limits.allowPause;
  const play = () => (timed && props.showCountdown !== false ? setCounting(true) : launcher.begin());

  let body: ReactNode = null;
  switch (state.phase) {
    case 'loading':
      body = <Loading label={labels.loading} />;
      break;
    case 'ready':
      if (counting) {
        body = (
          <GetReady
            onDone={() => {
              setCounting(false);
              launcher.begin();
            }}
          />
        );
      } else if (plugin) {
        const intro = <IntroCard plugin={plugin} timed={timed} onPlay={play} />;
        body = props.renderIntro ? props.renderIntro({ plugin, play }, intro) : intro;
      }
      break;
    case 'playing':
      body = state.runtime && plugin && <PlayingView runtime={state.runtime} plugin={plugin} launcher={launcher} renderHeader={props.renderHeader} hideChrome={props.hideChrome} />;
      break;
    case 'submitting': {
      const waiting = <Loading label={state.attempt > 1 ? labels.retrying : labels.submitting} />;
      body = props.renderSubmitting ? props.renderSubmitting({ attempt: state.attempt }, waiting) : waiting;
      break;
    }
    case 'result': {
      const result = state.result && (
        <ResultView
          result={state.result}
          title={plugin?.title ?? ''}
          gameId={plugin?.rules.gameId}
          session={state.session}
          showLeaderboard={props.showLeaderboard !== false}
          onPlayAgain={launcher.canPlayAgain ? launcher.playAgain : undefined}
          onClose={props.onClose}
        />
      );
      body =
        props.renderResult && state.result
          ? props.renderResult({ result: state.result, playAgain: launcher.canPlayAgain ? launcher.playAgain : undefined, close: props.onClose }, result)
          : result;
      break;
    }
    case 'error': {
      const card = (
        <Card style={stack(theme.spacing.md, { alignItems: 'stretch', textAlign: 'center' })}>
          <div style={{ alignSelf: 'center', width: 52, height: 52, borderRadius: 26, background: mix(c.danger, c.surface, 0.8), display: 'grid', placeItems: 'center' }}>
            <Icon name="cross" size={22} color={c.danger} />
          </div>
          <Body center>{state.error?.message}</Body>
          {state.error?.retryable && <Button label={labels.tryAgain} onClick={launcher.retry} />}
          {props.onClose && <Button variant="ghost" label={labels.close} onClick={props.onClose} />}
        </Card>
      );
      body = props.renderError
        ? props.renderError({ message: state.error?.message ?? '', retry: state.error?.retryable ? launcher.retry : undefined, close: props.onClose }, card)
        : card;
      break;
    }
  }

  return (
    <div
      className={`sg-root ${props.className ?? ''}`}
      style={{ background: c.background, padding: theme.spacing.lg, color: c.text, ...stack(theme.spacing.lg), ...props.style }}
    >
      <SageStyles />
      <FadeSlide trigger={`${state.phase}${counting}`} from={state.phase === 'result' ? 'bottom' : 'none'}>
        {body}
      </FadeSlide>
    </div>
  );
}

function IntroCard({ plugin, timed, onPlay }: { plugin: GamePlugin; timed: boolean; onPlay: () => void }) {
  const { theme, labels } = useSage();
  const Custom = useSlot('IntroCard');
  const slotStyle = useSlotStyle<CSSProperties>('intro');
  if (Custom) return <Custom gameId={plugin.rules.gameId} title={plugin.title} instructions={plugin.instructions} timed={timed} onPlay={onPlay} />;
  const c = theme.colors;
  const accent = gameAccent(theme, plugin.rules.gameId);
  return (
    <Surface padded={false} elevation="lg" style={{ overflow: 'hidden', ...slotStyle }}>
      <div style={{ position: 'relative', height: 150, display: 'grid', placeItems: 'center', background: gradientCss([accent, mix(accent, c.surface, 0.55)]) }}>
        <span aria-hidden style={{ position: 'absolute', top: 14, left: 20, fontSize: 18, color: 'rgba(255,255,255,.5)' }}>✦</span>
        <span aria-hidden style={{ position: 'absolute', bottom: 18, right: 26, fontSize: 26, color: 'rgba(255,255,255,.35)' }}>✦</span>
        <div style={{ width: 84, height: 84, borderRadius: 26, background: 'rgba(255,255,255,.18)', display: 'grid', placeItems: 'center', fontSize: 46 }}>{gameGlyph(plugin.rules.gameId)}</div>
      </div>
      <div style={stack(theme.spacing.md, { padding: theme.spacing.lg })}>
        <Heading size={26}>{plugin.title}</Heading>
        <Body muted>{plugin.instructions}</Body>
        <div style={row(8, { flexWrap: 'wrap' })}>
          <Chip label={timed ? labels.timed : labels.pauseAnytime} color={accent} icon={<Icon name="clock" size={12} color={accent} />} />
          <Chip label={labels.verified} tone="success" icon={<Icon name="check" size={12} color={c.success} />} />
        </div>
        <Button label={labels.play} icon="play" onClick={onPlay} style={{ marginTop: 4 }} />
      </div>
    </Surface>
  );
}

function GetReady({ onDone }: { onDone: () => void }) {
  const { theme, labels } = useSage();
  const Custom = useSlot('Countdown');
  const slotStyle = useSlotStyle<CSSProperties>('countdown');
  const motion = useMotion();
  const tick = useFeedback();
  const [n, setN] = useState(3);
  useEffect(() => {
    if (motion.reduced) {
      onDone();
      return;
    }
    tick('tap');
    const id = setTimeout(() => (n > 1 ? setN(n - 1) : onDone()), 650);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);
  if (Custom) return <Custom value={n} kind="getReady" />;
  return (
    <div role="timer" style={stack(theme.spacing.md, { alignItems: 'center', justifyContent: 'center', padding: '80px 0', ...slotStyle })}>
      <div style={{ color: theme.colors.textMuted, ...typeStyle(theme, theme.typography.heading) }}>{labels.getReady}</div>
      <Pop trigger={n}>
        <div style={{ color: theme.colors.primary, ...typeStyle(theme, theme.typography.display), fontSize: 96, lineHeight: 1 }}>{n}</div>
      </Pop>
    </div>
  );
}

function PlayingView({
  runtime,
  plugin,
  launcher,
  renderHeader,
  hideChrome,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runtime: PlayableRuntime<any>;
  plugin: GamePlugin;
  launcher: ReturnType<typeof useLauncher>;
  renderHeader?: GameLauncherProps['renderHeader'];
  hideChrome?: boolean;
}) {
  const { theme, labels } = useSage();
  const headerStyle = useSlotStyle<CSSProperties>('header');
  const boardStyle = useSlotStyle<CSSProperties>('gameBoard');
  const snap = useRuntimeSnapshot(runtime);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const c = theme.colors;
  const GameView = plugin.View;
  const canPause = plugin.rules.limits.allowPause;
  const accent = gameAccent(theme, plugin.rules.gameId);

  const header = renderHeader ? (
    renderHeader({ title: plugin.title, score: snap.score, elapsedMs: snap.elapsedMs, paused: snap.paused })
  ) : hideChrome ? null : (
    <div style={row(theme.spacing.sm, { alignItems: 'center', ...headerStyle })}>
      <div style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', fontSize: 20, background: gradientCss([accent, mix(accent, c.surface, 0.4)]) }}>{gameGlyph(plugin.rules.gameId)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: c.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...typeStyle(theme, theme.typography.heading), fontSize: 17 }}>{plugin.title}</div>
        <div style={{ ...row(6, { alignItems: 'center' }), color: c.textMuted, ...typeStyle(theme, theme.typography.caption) }}>
          {labels.score} <CountUp value={snap.score} duration={400} style={{ color: c.text }} /> · <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatClock(snap.elapsedMs)}</span>
        </div>
      </div>
      {canPause && <IconButton icon={snap.paused ? 'play' : 'pause'} label={snap.paused ? labels.resume : labels.pause} onClick={snap.paused ? launcher.resume : launcher.pause} />}
      <IconButton icon="close" label={labels.quit} onClick={() => setConfirmQuit(true)} />
    </div>
  );

  return (
    <div style={stack(theme.spacing.lg)}>
      {header}
      <div style={{ position: 'relative', ...boardStyle }}>
        <GameView
          state={snap.state}
          dispatch={(type, payload) => runtime.dispatch(type, payload)}
          elapsedMs={snap.elapsedMs}
          paused={snap.paused}
          ended={snap.ended}
          theme={theme}
          labels={labels}
        />
        {(snap.paused || confirmQuit) && (
          <div
            style={{
              position: 'absolute',
              inset: -theme.spacing.sm,
              background: c.overlay,
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              borderRadius: theme.radii.lg,
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'center',
              paddingTop: 60,
              zIndex: 10,
            }}
          >
            <FadeSlide>
              <Surface tone="raised" elevation="lg" style={stack(theme.spacing.md, { minWidth: 260 })}>
                {confirmQuit ? (
                  <>
                    <Heading>{labels.quit}?</Heading>
                    <Body muted>{labels.quitConfirm}</Body>
                    <Button variant="danger" label={labels.quit} onClick={launcher.quit} />
                    <Button variant="ghost" label={labels.resume} onClick={() => setConfirmQuit(false)} />
                  </>
                ) : (
                  <>
                    <div style={stack(6, { alignItems: 'center' })}>
                      <Icon name="pause" size={28} color={c.textMuted} />
                      <Heading>{labels.paused}</Heading>
                    </div>
                    <Button label={labels.resume} icon="play" onClick={launcher.resume} />
                  </>
                )}
              </Surface>
            </FadeSlide>
          </div>
        )}
      </div>
    </div>
  );
}

const MEDAL = ['medal1', 'medal2', 'medal3'] as const;

export function LeaderboardList({ session, highlightRank }: { session: SessionCredentials; highlightRank?: number | null }) {
  const { theme, labels } = useSage();
  const { board, loading } = useLeaderboard(session, { scope: 'context', limit: 10 });
  const CustomRow = useSlot('LeaderboardRow');
  const rowStyle = useSlotStyle<CSSProperties>('leaderboardRow');
  const c = theme.colors;
  if (loading && !board) return <Body muted>{labels.loading}</Body>;
  if (!board || board.entries.length === 0) return <Body muted>{labels.noScoresYet}</Body>;
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, ...stack(4) }}>
      {board.entries.map((e, k) => {
        const me = highlightRank != null && e.rank === highlightRank;
        if (CustomRow) {
          return (
            <li key={`${e.externalUserId}-${e.rank}`}>
              <CustomRow rank={e.rank} name={e.username ?? e.externalUserId} score={e.score} isYou={me} index={k} />
            </li>
          );
        }
        return (
          <li key={`${e.externalUserId}-${e.rank}`}>
            <FadeSlide from="right" delay={Math.min(k, 8) * 50}>
              <div
                style={row(10, {
                  alignItems: 'center',
                  padding: '9px 10px',
                  borderRadius: theme.radii.md,
                  background: me ? alpha(c.primary, 0.2) : 'transparent',
                  border: `1px solid ${me ? alpha(c.primary, 0.5) : 'transparent'}`,
                  ...rowStyle,
                })}
              >
                <span style={{ width: 30, display: 'grid', placeItems: 'center', color: c.textMuted, ...font(theme, 'bold') }}>
                  {e.rank <= 3 ? <Icon name={MEDAL[e.rank - 1]} size={20} /> : e.rank}
                </span>
                <span style={{ flex: 1, color: c.text, fontSize: 15, ...font(theme, me ? 'bold' : 'regular') }}>{e.username ?? e.externalUserId}</span>
                <span style={{ color: c.text, fontSize: 15, fontVariantNumeric: 'tabular-nums', ...font(theme, 'bold') }}>{e.score}</span>
              </div>
            </FadeSlide>
          </li>
        );
      })}
    </ol>
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
  const heroStyle = useSlotStyle<CSSProperties>('resultHero');
  const c = theme.colors;
  const status = result.status === 'rejected' ? labels.rejected : result.valid ? labels.verified : labels.notRanked;
  const top = result.valid && result.rank === 1;
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
    <div style={stack(theme.spacing.lg)}>
      {CustomHero ? (
        <CustomHero gameId={gameId} title={title} score={result.score} rank={result.rank ?? null} durationMs={result.durationMs} valid={result.valid} />
      ) : (
      <Surface gradient="hero" elevation="lg" style={stack(theme.spacing.sm, { position: 'relative', alignItems: 'center', textAlign: 'center', overflow: 'hidden', padding: `${theme.spacing.xl}px ${theme.spacing.lg}px`, ...heroStyle })}>
        <Confetti fire={fire} />
        <div style={{ width: 64, height: 64, borderRadius: 22, background: 'rgba(255,255,255,.18)', display: 'grid', placeItems: 'center', fontSize: 34 }}>{top ? '🏆' : gameId ? gameGlyph(gameId) : '⭐'}</div>
        <div style={{ color: alpha(c.onPrimary, 0.85), ...typeStyle(theme, theme.typography.body) }}>{title}</div>
        <div style={{ color: c.onPrimary, letterSpacing: 1.5, textTransform: 'uppercase', ...typeStyle(theme, theme.typography.caption) }}>{labels.yourScore}</div>
        <CountUp value={result.score} style={{ color: c.onPrimary, ...typeStyle(theme, theme.typography.display), fontSize: 60, lineHeight: 1.05 }} />
        <div style={row(8, { flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 })}>
          {result.rank != null && <Chip label={`${labels.rank} #${result.rank}`} color={c.onPrimary} icon={<Icon name="trophy" size={13} />} />}
          <Chip label={formatDuration(result.durationMs)} color={c.onPrimary} icon={<Icon name="clock" size={13} color={c.onPrimary} />} />
        </div>
        {top && <div style={{ color: c.onPrimary, marginTop: 4, ...typeStyle(theme, theme.typography.heading) }}>{labels.newBest}</div>}
      </Surface>
      )}

      <div style={{ textAlign: 'center' }}>
        <Chip label={status} tone={result.valid ? 'success' : result.status === 'rejected' ? 'danger' : 'neutral'} icon={result.valid ? <Icon name="check" size={13} color={c.success} /> : undefined} />
      </div>

      {showLeaderboard && session && (
        <Card style={stack(theme.spacing.sm)}>
          <Heading size={17}>{labels.leaderboard}</Heading>
          <LeaderboardList session={session} highlightRank={result.rank} />
        </Card>
      )}

      <div style={stack(theme.spacing.sm)}>
        {onPlayAgain && <Button label={labels.playAgain} icon="play" onClick={onPlayAgain} />}
        {onClose && <Button variant="ghost" label={labels.close} onClick={onClose} />}
      </div>
    </div>
  );
}

/** Renders a game locally with no session (demos, tutorials, design work). Not verified. */
export function GamePreview({ plugin, seed = 'preview', config }: { plugin: GamePlugin; seed?: string; config?: Record<string, unknown> }) {
  const { theme, labels } = useSage();
  const { runtime, snapshot } = useLocalGame(plugin.rules, seed, config);
  const GameView = plugin.View;
  return (
    <div className="sg-root" style={{ background: theme.colors.background, padding: theme.spacing.lg }}>
      <SageStyles />
      <GameView
        state={snapshot.state}
        dispatch={(type, payload) => runtime.dispatch(type, payload)}
        elapsedMs={snapshot.elapsedMs}
        paused={snapshot.paused}
        ended={snapshot.ended}
        theme={theme}
        labels={labels}
      />
    </div>
  );
}

/** Games this app can play, from the public catalog, as a grid of tiles. */
export function GameCatalog({ onSelectGame, category }: { onSelectGame: (game: Game) => void; category?: GameCategory }) {
  const { theme, labels, plugins } = useSage();
  const { games, loading, error } = useGames({ category });
  const c = theme.colors;
  if (loading) return <Loading label={labels.loading} />;
  if (error) return <Body muted>{error.message}</Body>;
  return (
    <div className="sg-root" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: theme.spacing.md }}>
      <SageStyles />
      {games.map((g, i) => {
        const accent = gameAccent(theme, g.id);
        return (
          <FadeSlide key={g.id} delay={i * 60}>
            <button
              type="button"
              className="sg-press"
              onClick={() => onSelectGame(g)}
              style={{
                display: 'block',
                width: '100%',
                height: '100%',
                textAlign: 'left',
                padding: 0,
                overflow: 'hidden',
                background: c.surface,
                border: `1px solid ${c.border}`,
                borderRadius: theme.radii.lg,
                boxShadow: shadowCss(theme, 'md'),
                color: c.text,
              }}
            >
              <div style={{ height: 92, display: 'grid', placeItems: 'center', fontSize: 40, background: gradientCss([accent, mix(accent, c.surface, 0.5)]) }}>{gameGlyph(g.id)}</div>
              <div style={stack(4, { padding: theme.spacing.md })}>
                <span style={{ ...typeStyle(theme, theme.typography.heading), fontSize: 16 }}>{plugins.get(g.id)?.title ?? g.name}</span>
                <span style={{ fontSize: 13, color: c.textMuted, ...font(theme, 'regular') }}>{g.description}</span>
              </div>
            </button>
          </FadeSlide>
        );
      })}
    </div>
  );
}
