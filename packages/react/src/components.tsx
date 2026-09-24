import React, { CSSProperties, ReactNode, useEffect, useState } from 'react';
import { CompletionResult, Game, GameCategory, SessionCredentials } from '@sagegames/types';
import { GameRuntime } from '@sagegames/core';
import {
  formatClock,
  formatDuration,
  GamePlugin,
  useGames,
  useLauncher,
  UseLauncherOptions,
  useLeaderboard,
  useLocalGame,
  useRuntimeSnapshot,
  useSage,
} from '@sagegames/react-headless';
import { Body, Button, Card, font, Heading, Loading, row, SageStyles, stack, Stat } from './ui';

export interface GameLauncherProps extends UseLauncherOptions {
  onClose?: () => void;
  /** Show the chat/group leaderboard on the result screen (default true). */
  showLeaderboard?: boolean;
  renderHeader?: (info: { title: string; score: number; elapsedMs: number; paused: boolean }) => ReactNode;
  hideChrome?: boolean;
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

  // Pause when the tab is hidden (games that allow pausing).
  useEffect(() => {
    const onVisibility = () => document.visibilityState === 'hidden' && launcher.pause();
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launcher.pause]);

  let body: ReactNode = null;
  switch (state.phase) {
    case 'loading':
      body = <Loading label={labels.loading} />;
      break;
    case 'ready':
      body = (
        <Card style={stack(theme.spacing.md)}>
          <Heading size={24}>{plugin?.title}</Heading>
          <Body muted>{plugin?.instructions}</Body>
          <Button label={labels.play} onClick={launcher.begin} />
        </Card>
      );
      break;
    case 'playing':
      body = state.runtime && plugin && <PlayingView runtime={state.runtime} plugin={plugin} launcher={launcher} renderHeader={props.renderHeader} hideChrome={props.hideChrome} />;
      break;
    case 'submitting':
      body = <Loading label={state.attempt > 1 ? labels.retrying : labels.submitting} />;
      break;
    case 'result':
      body = state.result && (
        <ResultView
          result={state.result}
          title={plugin?.title ?? ''}
          session={state.session}
          showLeaderboard={props.showLeaderboard !== false}
          onPlayAgain={launcher.canPlayAgain ? launcher.playAgain : undefined}
          onClose={props.onClose}
        />
      );
      break;
    case 'error':
      body = (
        <Card style={stack(theme.spacing.md, { alignItems: 'stretch', textAlign: 'center' })}>
          <Body center>{state.error?.message}</Body>
          {state.error?.retryable && <Button label={labels.tryAgain} onClick={launcher.retry} />}
          {props.onClose && <Button variant="ghost" label={labels.close} onClick={props.onClose} />}
        </Card>
      );
      break;
  }

  return (
    <div
      className={`sg-root ${props.className ?? ''}`}
      style={{ background: theme.colors.background, padding: theme.spacing.lg, color: theme.colors.text, ...stack(theme.spacing.lg), ...props.style }}
    >
      <SageStyles />
      {body}
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
  runtime: GameRuntime<any, any, any, any>;
  plugin: GamePlugin;
  launcher: ReturnType<typeof useLauncher>;
  renderHeader?: GameLauncherProps['renderHeader'];
  hideChrome?: boolean;
}) {
  const { theme, labels } = useSage();
  const snap = useRuntimeSnapshot(runtime);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const c = theme.colors;
  const GameView = plugin.View;

  const header = renderHeader ? (
    renderHeader({ title: plugin.title, score: snap.score, elapsedMs: snap.elapsedMs, paused: snap.paused })
  ) : hideChrome ? null : (
    <div style={row(theme.spacing.sm, { alignItems: 'center' })}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: c.text, fontSize: 17, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...font(theme, 'bold') }}>{plugin.title}</div>
        <div style={{ color: c.textMuted, fontSize: 13, fontVariantNumeric: 'tabular-nums', ...font(theme, 'medium') }}>
          {labels.score} {snap.score} · {formatClock(snap.elapsedMs)}
        </div>
      </div>
      {plugin.rules.limits.allowPause && (
        <Button compact variant="ghost" label={snap.paused ? labels.resume : labels.pause} onClick={snap.paused ? launcher.resume : launcher.pause} />
      )}
      <Button compact variant="ghost" label={labels.quit} onClick={() => setConfirmQuit(true)} />
    </div>
  );

  return (
    <div style={stack(theme.spacing.lg)}>
      {header}
      {confirmQuit && (
        <Card style={stack(theme.spacing.sm)}>
          <Body>{labels.quitConfirm}</Body>
          <div style={row(theme.spacing.sm)}>
            <Button compact variant="danger" label={labels.quit} onClick={launcher.quit} style={{ flex: 1 }} />
            <Button compact variant="ghost" label={labels.resume} onClick={() => setConfirmQuit(false)} style={{ flex: 1 }} />
          </div>
        </Card>
      )}
      <div style={{ position: 'relative' }}>
        <GameView
          state={snap.state}
          dispatch={(type, payload) => runtime.dispatch(type, payload)}
          elapsedMs={snap.elapsedMs}
          paused={snap.paused}
          ended={snap.ended}
          theme={theme}
          labels={labels}
        />
        {snap.paused && (
          <div style={{ position: 'absolute', inset: 0, background: c.background, opacity: 0.96, ...stack(theme.spacing.md, { alignItems: 'center', justifyContent: 'center' }) }}>
            <Heading>{labels.paused}</Heading>
            <Button label={labels.resume} onClick={launcher.resume} />
          </div>
        )}
      </div>
    </div>
  );
}

export function LeaderboardList({ session, highlightRank }: { session: SessionCredentials; highlightRank?: number | null }) {
  const { theme, labels } = useSage();
  const { board, loading } = useLeaderboard(session, { scope: 'context', limit: 10 });
  const c = theme.colors;
  if (loading && !board) return <Body muted>{labels.loading}</Body>;
  if (!board || board.entries.length === 0) return <Body muted>{labels.noScoresYet}</Body>;
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, ...stack(2) }}>
      {board.entries.map((e) => {
        const me = highlightRank != null && e.rank === highlightRank;
        return (
          <li key={`${e.externalUserId}-${e.rank}`} style={row(0, { alignItems: 'center', padding: '8px 10px', borderRadius: theme.radii.sm, background: me ? c.cellSelected : 'transparent' })}>
            <span style={{ width: 32, color: e.rank <= 3 ? c.primary : c.textMuted, ...font(theme, 'bold') }}>{e.rank}</span>
            <span style={{ flex: 1, color: c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...font(theme, me ? 'bold' : 'regular') }}>
              {e.username ?? e.externalUserId}
            </span>
            <span style={{ color: c.text, fontVariantNumeric: 'tabular-nums', ...font(theme, 'bold') }}>{e.score}</span>
          </li>
        );
      })}
    </ol>
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
  const status = result.status === 'rejected' ? labels.rejected : result.valid ? labels.verified : labels.notRanked;
  return (
    <div style={stack(theme.spacing.lg)}>
      <Card style={stack(theme.spacing.md, { alignItems: 'center', textAlign: 'center' })}>
        <Body muted>{title}</Body>
        <div style={{ color: c.text, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', ...font(theme, 'medium') }}>{labels.yourScore}</div>
        <div style={{ color: c.primary, fontSize: 52, lineHeight: 1, fontVariantNumeric: 'tabular-nums', ...font(theme, 'bold') }}>{result.score}</div>
        <div style={row(theme.spacing.xl)}>
          {result.rank != null && <Stat label={labels.rank} value={`#${result.rank}`} align="center" />}
          <Stat label={labels.time} value={formatDuration(result.durationMs)} align="center" />
        </div>
        <div style={{ color: result.valid ? c.success : c.textMuted, fontSize: 13, ...font(theme, 'medium') }}>
          {result.valid ? '✓ ' : ''}
          {status}
        </div>
      </Card>
      {showLeaderboard && session && (
        <Card style={stack(theme.spacing.sm)}>
          <Heading size={17}>{labels.leaderboard}</Heading>
          <LeaderboardList session={session} highlightRank={result.rank} />
        </Card>
      )}
      <div style={stack(theme.spacing.sm)}>
        {onPlayAgain && <Button label={labels.playAgain} onClick={onPlayAgain} />}
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

/** Games this app can play, from the public catalog. */
export function GameCatalog({ onSelectGame, category }: { onSelectGame: (game: Game) => void; category?: GameCategory }) {
  const { theme, labels, plugins } = useSage();
  const { games, loading, error } = useGames({ category });
  const c = theme.colors;
  if (loading) return <Loading label={labels.loading} />;
  if (error) return <Body muted>{error.message}</Body>;
  return (
    <div className="sg-root" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: theme.spacing.md }}>
      <SageStyles />
      {games.map((g) => (
        <button
          key={g.id}
          type="button"
          onClick={() => onSelectGame(g)}
          style={{
            textAlign: 'left',
            background: c.surface,
            border: `1px solid ${c.border}`,
            borderRadius: theme.radii.lg,
            padding: theme.spacing.lg,
            color: c.text,
            ...stack(4),
          }}
        >
          <span style={{ fontSize: 17, ...font(theme, 'bold') }}>{plugins.get(g.id)?.title ?? g.name}</span>
          <span style={{ fontSize: 14, color: c.textMuted, ...font(theme, 'regular') }}>{g.description}</span>
        </button>
      ))}
    </div>
  );
}
