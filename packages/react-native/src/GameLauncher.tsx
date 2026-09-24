import React, { ReactNode, useEffect, useState } from 'react';
import { AppState, ScrollView, StyleProp, Text, View, ViewStyle } from 'react-native';
import { GameRuntime } from '@sagegames/core';
import {
  formatClock,
  GamePlugin,
  useLauncher,
  UseLauncherOptions,
  useRuntimeSnapshot,
  useSage,
} from '@sagegames/react-headless';
import { Body, Button, Card, font, Heading, Loading } from './ui/primitives';
import { ResultView } from './ui/ResultView';

export interface GameLauncherProps extends UseLauncherOptions {
  /** Called when the player taps Close (on the result or error screen). */
  onClose?: () => void;
  /** Show the chat/group leaderboard on the result screen (default true). */
  showLeaderboard?: boolean;
  /** Replace the top bar. */
  renderHeader?: (info: { title: string; score: number; elapsedMs: number; paused: boolean }) => ReactNode;
  /** Hide the top bar entirely. */
  hideChrome?: boolean;
  style?: StyleProp<ViewStyle>;
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

  // Pause when the app goes to the background (games that allow pausing).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') launcher.pause();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launcher.pause]);

  let body: ReactNode;
  switch (state.phase) {
    case 'loading':
      body = <Loading label={labels.loading} />;
      break;
    case 'ready':
      body = (
        <Card style={{ gap: theme.spacing.md }}>
          <Heading size={24}>{plugin?.title}</Heading>
          <Body muted>{plugin?.instructions}</Body>
          <Button label={labels.play} onPress={launcher.begin} />
        </Card>
      );
      break;
    case 'playing':
      body = state.runtime && plugin ? <PlayingView runtime={state.runtime} plugin={plugin} launcher={launcher} renderHeader={props.renderHeader} hideChrome={props.hideChrome} /> : null;
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
        <Card style={{ gap: theme.spacing.md, alignItems: 'center' }}>
          <Body center>{state.error?.message}</Body>
          {state.error?.retryable && <Button label={labels.tryAgain} onPress={launcher.retry} style={{ alignSelf: 'stretch' }} />}
          {props.onClose && <Button variant="ghost" label={labels.close} onPress={props.onClose} style={{ alignSelf: 'stretch' }} />}
        </Card>
      );
      break;
  }

  return (
    <ScrollView
      style={[{ flex: 1, backgroundColor: c.background }, props.style]}
      contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.xl * 2, gap: theme.spacing.lg }}
      keyboardShouldPersistTaps="handled"
      scrollEnabled={state.phase !== 'playing'}
    >
      {body}
    </ScrollView>
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
  const View_ = plugin.View;
  const canPause = plugin.rules.limits.allowPause;

  const header = renderHeader ? (
    renderHeader({ title: plugin.title, score: snap.score, elapsedMs: snap.elapsedMs, paused: snap.paused })
  ) : hideChrome ? null : (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={[{ color: c.text, fontSize: 17 }, font(theme, 'bold')]}>
          {plugin.title}
        </Text>
        <Text style={[{ color: c.textMuted, fontSize: 13, fontVariant: ['tabular-nums'] }, font(theme, 'medium')]}>
          {labels.score} {snap.score} · {formatClock(snap.elapsedMs)}
        </Text>
      </View>
      {canPause && (
        <Button compact variant="ghost" label={snap.paused ? labels.resume : labels.pause} onPress={snap.paused ? launcher.resume : launcher.pause} />
      )}
      <Button compact variant="ghost" label={labels.quit} onPress={() => setConfirmQuit(true)} />
    </View>
  );

  return (
    <View style={{ gap: theme.spacing.lg }}>
      {header}

      {confirmQuit && (
        <Card style={{ gap: theme.spacing.sm }}>
          <Body>{labels.quitConfirm}</Body>
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <Button compact variant="danger" label={labels.quit} onPress={launcher.quit} style={{ flex: 1 }} />
            <Button compact variant="ghost" label={labels.resume} onPress={() => setConfirmQuit(false)} style={{ flex: 1 }} />
          </View>
        </Card>
      )}

      <View>
        <View_
          state={snap.state}
          dispatch={(type, payload) => runtime.dispatch(type, payload)}
          elapsedMs={snap.elapsedMs}
          paused={snap.paused}
          ended={snap.ended}
          theme={theme}
          labels={labels}
        />
        {snap.paused && (
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: c.background,
              opacity: 0.96,
              gap: theme.spacing.md,
            }}
          >
            <Heading>{labels.paused}</Heading>
            <Button label={labels.resume} onPress={launcher.resume} />
          </View>
        )}
      </View>
    </View>
  );
}
