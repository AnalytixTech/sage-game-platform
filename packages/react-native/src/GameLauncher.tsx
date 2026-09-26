import React, { ReactNode, useEffect, useState } from 'react';
import { AppState, ScrollView, StyleProp, Text, View, ViewStyle } from 'react-native';
import { PlayableRuntime } from '@sagegames/core';
import { CompletionResult } from '@sagegames/types';
import {
  formatClock,
  gameAccent,
  gameGlyph,
  GamePlugin,
  mix,
  RenderOverride,
  useFeedback,
  useSlot,
  useSlotStyle,
  useLauncher,
  UseLauncherOptions,
  useRuntimeSnapshot,
  useSage,
} from '@sagegames/react-headless';
import {
  Body,
  Button,
  Card,
  Chip,
  CountUp,
  FadeSlide,
  gradientStyle,
  Heading,
  Icon,
  IconButton,
  Loading,
  Pop,
  Surface,
  typeStyle,
  useMotion,
} from './ui/primitives';
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
  /** 3-2-1 before timed games (Quiz, Word Rush). Default true. */
  showCountdown?: boolean;
  /** Replace or wrap the intro card (receives the default element). */
  renderIntro?: RenderOverride<{ plugin: GamePlugin; play: () => void }>;
  /** Replace or wrap the result screen. */
  renderResult?: RenderOverride<{ result: CompletionResult; playAgain?: () => void; close?: () => void }>;
  /** Replace or wrap the "Checking your score…" screen. */
  renderSubmitting?: RenderOverride<{ attempt: number }>;
  /** Replace or wrap the error card. */
  renderError?: RenderOverride<{ message: string; retry?: () => void; close?: () => void }>;
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
  const [counting, setCounting] = useState(false);

  // Pause when the app goes to the background (games that allow pausing).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') launcher.pause();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launcher.pause]);

  const timed = !!plugin && !plugin.rules.limits.allowPause;
  const play = () => (timed && props.showCountdown !== false ? setCounting(true) : launcher.begin());

  let body: ReactNode;
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
      body = state.runtime && plugin ? <PlayingView runtime={state.runtime} plugin={plugin} launcher={launcher} renderHeader={props.renderHeader} hideChrome={props.hideChrome} /> : null;
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
        <Card style={{ gap: theme.spacing.md, alignItems: 'center' }}>
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: mix(c.danger, c.surface, 0.8), alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="cross" size={22} color={c.danger} />
          </View>
          <Body center>{state.error?.message}</Body>
          {state.error?.retryable && <Button label={labels.tryAgain} onPress={launcher.retry} style={{ alignSelf: 'stretch' }} />}
          {props.onClose && <Button variant="ghost" label={labels.close} onPress={props.onClose} style={{ alignSelf: 'stretch' }} />}
        </Card>
      );
      body = props.renderError
        ? props.renderError({ message: state.error?.message ?? '', retry: state.error?.retryable ? launcher.retry : undefined, close: props.onClose }, card)
        : card;
      break;
    }
  }

  return (
    <ScrollView
      style={[{ flex: 1, backgroundColor: c.background }, props.style]}
      contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.xl * 2, gap: theme.spacing.lg }}
      keyboardShouldPersistTaps="handled"
      scrollEnabled={state.phase !== 'playing'}
    >
      <FadeSlide trigger={`${state.phase}${counting}`} from={state.phase === 'result' ? 'bottom' : 'none'}>
        {body}
      </FadeSlide>
    </ScrollView>
  );
}

/** The game's hero card: accent gradient, glyph, rules and a big Play button. */
function IntroCard({ plugin, timed, onPlay }: { plugin: GamePlugin; timed: boolean; onPlay: () => void }) {
  const { theme, labels } = useSage();
  const Custom = useSlot('IntroCard');
  const slotStyle = useSlotStyle<StyleProp<ViewStyle>>('intro');
  if (Custom) return <Custom gameId={plugin.rules.gameId} title={plugin.title} instructions={plugin.instructions} timed={timed} onPlay={onPlay} />;
  const c = theme.colors;
  const accent = gameAccent(theme, plugin.rules.gameId);
  return (
    <Surface padded={false} style={[{ overflow: 'hidden' }, slotStyle]} elevation="lg">
      <View style={[{ height: 150, alignItems: 'center', justifyContent: 'center' }, gradientStyle([accent, mix(accent, c.surface, 0.55)])]}>
        <Text style={{ position: 'absolute', top: 14, left: 20, fontSize: 18, color: 'rgba(255,255,255,0.5)' }}>✦</Text>
        <Text style={{ position: 'absolute', bottom: 18, right: 26, fontSize: 26, color: 'rgba(255,255,255,0.35)' }}>✦</Text>
        <View style={{ width: 84, height: 84, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 46 }}>{gameGlyph(plugin.rules.gameId)}</Text>
        </View>
      </View>
      <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
        <Heading size={26}>{plugin.title}</Heading>
        <Body muted>{plugin.instructions}</Body>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip label={timed ? labels.timed : labels.pauseAnytime} color={accent} icon={<Icon name="clock" size={11} color={accent} />} />
          <Chip label={labels.verified} tone="success" icon={<Icon name="check" size={11} color={c.success} />} />
        </View>
        <Button label={labels.play} icon="play" onPress={onPlay} style={{ marginTop: 4 }} />
      </View>
    </Surface>
  );
}

/** 3 · 2 · 1 before a timed game starts. */
function GetReady({ onDone }: { onDone: () => void }) {
  const { theme, labels } = useSage();
  const Custom = useSlot('Countdown');
  const slotStyle = useSlotStyle<StyleProp<ViewStyle>>('countdown');
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
    <View accessibilityRole="timer" style={[{ alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: theme.spacing.md }, slotStyle]}>
      <Text style={[typeStyle(theme, theme.typography.heading), { color: theme.colors.textMuted }]}>{labels.getReady}</Text>
      <Pop trigger={n} peak={1.35}>
        <Text style={[typeStyle(theme, theme.typography.display), { color: theme.colors.primary, fontSize: 96, lineHeight: 104 }]}>{n}</Text>
      </Pop>
    </View>
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
  const headerStyle = useSlotStyle<StyleProp<ViewStyle>>('header');
  const boardStyle = useSlotStyle<StyleProp<ViewStyle>>('gameBoard');
  const snap = useRuntimeSnapshot(runtime);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const c = theme.colors;
  const View_ = plugin.View;
  const canPause = plugin.rules.limits.allowPause;
  const accent = gameAccent(theme, plugin.rules.gameId);

  const header = renderHeader ? (
    renderHeader({ title: plugin.title, score: snap.score, elapsedMs: snap.elapsedMs, paused: snap.paused })
  ) : hideChrome ? null : (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }, headerStyle]}>
      <View style={[{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, gradientStyle([accent, mix(accent, c.surface, 0.4)])]}>
        <Text style={{ fontSize: 20 }}>{gameGlyph(plugin.rules.gameId)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={[typeStyle(theme, theme.typography.heading), { color: c.text, fontSize: 17 }]}>
          {plugin.title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[typeStyle(theme, theme.typography.caption), { color: c.textMuted }]}>{labels.score}</Text>
          <CountUp value={snap.score} duration={400} style={[typeStyle(theme, theme.typography.caption), { color: c.text, fontVariant: ['tabular-nums'] }]} />
          <Text style={[typeStyle(theme, theme.typography.caption), { color: c.textMuted, fontVariant: ['tabular-nums'] }]}>· {formatClock(snap.elapsedMs)}</Text>
        </View>
      </View>
      {canPause && (
        <IconButton icon={snap.paused ? 'play' : 'pause'} label={snap.paused ? labels.resume : labels.pause} onPress={snap.paused ? launcher.resume : launcher.pause} />
      )}
      <IconButton icon="close" label={labels.quit} onPress={() => setConfirmQuit(true)} />
    </View>
  );

  return (
    <View style={{ gap: theme.spacing.lg }}>
      {header}

      <View style={boardStyle}>
        <View_
          state={snap.state}
          dispatch={(type, payload) => runtime.dispatch(type, payload)}
          elapsedMs={snap.elapsedMs}
          paused={snap.paused}
          ended={snap.ended}
          theme={theme}
          labels={labels}
        />
        {(snap.paused || confirmQuit) && (
          <View
            style={{
              position: 'absolute',
              top: -theme.spacing.sm,
              left: -theme.spacing.sm,
              right: -theme.spacing.sm,
              bottom: -theme.spacing.sm,
              backgroundColor: c.overlay,
              borderRadius: theme.radii.lg,
              alignItems: 'center',
              justifyContent: 'flex-start',
              paddingTop: 60,
            }}
          >
            <FadeSlide from="bottom">
              <Surface tone="raised" elevation="lg" style={{ gap: theme.spacing.md, minWidth: 260, alignItems: 'stretch' }}>
                {confirmQuit ? (
                  <>
                    <Heading>{labels.quit}?</Heading>
                    <Body muted>{labels.quitConfirm}</Body>
                    <Button variant="danger" label={labels.quit} onPress={launcher.quit} />
                    <Button variant="ghost" label={labels.resume} onPress={() => setConfirmQuit(false)} />
                  </>
                ) : (
                  <>
                    <View style={{ alignItems: 'center', gap: 6 }}>
                      <Icon name="pause" size={28} color={c.textMuted} />
                      <Heading>{labels.paused}</Heading>
                    </View>
                    <Button label={labels.resume} icon="play" onPress={launcher.resume} />
                  </>
                )}
              </Surface>
            </FadeSlide>
          </View>
        )}
      </View>
    </View>
  );
}
