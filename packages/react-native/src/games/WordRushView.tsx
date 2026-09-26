import React, { useMemo, useRef } from 'react';
import { GestureResponderEvent, PanResponder, ScrollView, Text, View } from 'react-native';
import type { WordRushState } from '@sagegames/game-word-rush';
import { alpha, findEvent, formatClock, gameAccent, GameViewProps, SageLabels, useGameEvents, useWordRush, wordRushEvents } from '@sagegames/react-headless';
import { Button, FadeSlide, FloatUp, font, gradientStyle, Icon, Pop, ProgressBar, Pulse, shadowStyle, Shake, Stat, useBoardWidth } from '../ui/primitives';

const REJECTION_LABEL = (labels: SageLabels): Record<string, string> => ({
  not_adjacent: labels.notAdjacent,
  too_short: labels.tooShort,
  not_a_word: labels.notAWord,
  already_found: labels.alreadyFound,
});

export function WordRushView({ state, dispatch, elapsedMs, theme, labels, paused, ended }: GameViewProps<WordRushState>) {
  const rush = useWordRush(state, elapsedMs, dispatch);
  const { events, seq } = useGameEvents(state, wordRushEvents);
  const { width: boardWidth, onLayout } = useBoardWidth(400, theme.spacing.lg);
  const c = theme.colors;
  const accent = gameAccent(theme, 'game_word_001');
  const gap = 8;
  const tile = (boardWidth - gap * (state.size - 1)) / state.size;
  const pitch = tile + gap;

  /** Tile under the finger, only when near its centre (so diagonals don't clip neighbours). */
  const tileAt = (e: GestureResponderEvent): number | null => {
    const { locationX, locationY } = e.nativeEvent;
    const col = Math.floor(locationX / pitch);
    const row = Math.floor(locationY / pitch);
    if (row < 0 || col < 0 || row >= state.size || col >= state.size) return null;
    const dx = locationX - (col * pitch + tile / 2);
    const dy = locationY - (row * pitch + tile / 2);
    return Math.hypot(dx, dy) <= tile * 0.42 ? row * state.size + col : null;
  };

  const r = useRef({ rush, start: null as number | null, dragging: false, disabled: false });
  r.current.rush = rush;
  r.current.disabled = paused || ended;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !r.current.disabled,
        onMoveShouldSetPanResponder: () => !r.current.disabled,
        onPanResponderTerminationRequest: () => false,
        // A press counts as a tap straight away (some platforms send no release for a still press);
        // moving onto another tile turns it into a drag, and lifting then submits.
        onPanResponderGrant: (e) => {
          const t = tileAt(e);
          r.current.start = t;
          r.current.dragging = false;
          if (t !== null) r.current.rush.tap(t);
        },
        onPanResponderMove: (e) => {
          const t = tileAt(e);
          const { start } = r.current;
          if (t === null || start === null) return;
          if (!r.current.dragging && t !== start) {
            r.current.dragging = true;
            r.current.rush.beginPath(start);
          }
          if (r.current.dragging) r.current.rush.extendTo(t);
        },
        onPanResponderRelease: () => {
          if (r.current.dragging) r.current.rush.submit(); // drag: lift to submit
          r.current.dragging = false;
          r.current.start = null;
        },
        onPanResponderTerminate: () => {
          r.current.dragging = false;
          r.current.start = null;
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pitch, tile, state.size]
  );

  const last = state.last;
  const lowTime = rush.remainingMs < 10_000 && !ended;
  const scored = findEvent(events, 'wordScored');
  const rejected = findEvent(events, 'wordRejected');
  const centre = (i: number) => ({ x: (i % state.size) * pitch + tile / 2, y: Math.floor(i / state.size) * pitch + tile / 2 });
  const lineWidth = Math.max(6, tile * 0.16);

  return (
    <View onLayout={onLayout} style={{ gap: theme.spacing.md, alignItems: 'center' }}>
      <View style={{ alignSelf: 'stretch', gap: theme.spacing.sm }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <Stat label={labels.words} value={state.found.length} icon="star" />
          <Pulse active={lowTime}>
            <Stat label={labels.time} value={formatClock(rush.remainingMs)} align="flex-end" icon="clock" />
          </Pulse>
        </View>
        <ProgressBar fraction={rush.remainingMs / state.durationMs} color={lowTime ? c.danger : undefined} />
      </View>

      <Shake trigger={rejected ? seq : null} style={{ alignSelf: 'stretch' }}>
        <View
          style={{
            minHeight: 52,
            borderRadius: theme.radii.lg,
            backgroundColor: rush.word ? alpha(accent, 0.16) : c.surfaceAlt,
            borderWidth: 1,
            borderColor: rush.word ? alpha(accent, 0.5) : c.border,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 12,
          }}
        >
          {rush.word ? (
            <Text style={[{ color: c.text, fontSize: 26, letterSpacing: 4 }, font(theme, 'bold')]}>{rush.word}</Text>
          ) : last ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name={last.rejected ? 'cross' : 'check'} size={15} color={last.rejected ? c.danger : c.success} />
              <Text style={[{ color: last.rejected ? c.danger : c.success, fontSize: 15 }, font(theme, 'medium')]}>
                {last.rejected
                  ? `${last.word ? `${last.word.toUpperCase()}: ` : ''}${REJECTION_LABEL(labels)[last.rejected]}`
                  : `${last.word.toUpperCase()} +${last.points}`}
              </Text>
            </View>
          ) : (
            <Text style={[{ color: c.textMuted, fontSize: 14 }, font(theme, 'regular')]}>Drag through touching letters, or tap them</Text>
          )}
        </View>
        <FloatUp trigger={scored ? seq : null} text={scored ? `+${scored.points}` : ''} style={{ top: -8 }} />
      </Shake>

      <View
        {...responder.panHandlers}
        pointerEvents="box-only"
        testID="word-rush-grid"
        style={{ width: boardWidth, height: boardWidth, flexDirection: 'row', flexWrap: 'wrap', gap }}
      >
        {state.grid.map((face, i) => {
          const inPath = rush.path.includes(i);
          const isLast = rush.path[rush.path.length - 1] === i;
          return (
            <Pop key={i} trigger={isLast ? rush.path.length : null} peak={1.1}>
              <View
                style={[
                  {
                    width: tile,
                    height: tile,
                    borderRadius: theme.radii.md,
                    borderWidth: 1,
                    borderBottomWidth: inPath ? 1 : 4,
                    borderColor: inPath ? 'transparent' : c.border,
                    borderBottomColor: inPath ? 'transparent' : alpha(c.text, 0.18),
                    alignItems: 'center',
                    justifyContent: 'center',
                  },
                  inPath ? gradientStyle(theme.gradients.primary) : { backgroundColor: c.surfaceRaised },
                  shadowStyle(theme, inPath ? 'md' : 'sm'),
                ]}
              >
                <Text style={[{ color: inPath ? c.onPrimary : c.text, fontSize: tile * (face.length > 1 ? 0.34 : 0.44) }, font(theme, 'bold')]}>
                  {paused ? '' : face === 'QU' ? 'Qu' : face}
                </Text>
                {isLast && <View style={{ position: 'absolute', top: -3, left: -3, right: -3, bottom: -3, borderRadius: theme.radii.md + 3, borderWidth: 2, borderColor: c.primaryAlt }} />}
              </View>
            </Pop>
          );
        })}
        {/* The word's path, drawn over the tiles (touches pass through). */}
        {rush.path.slice(1).map((to, k) => {
          const a = centre(rush.path[k]);
          const b = centre(to);
          const length = Math.hypot(b.x - a.x, b.y - a.y);
          const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
          return (
            <View
              key={`${rush.path[k]}-${to}`}
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: (a.x + b.x) / 2 - length / 2,
                top: (a.y + b.y) / 2 - lineWidth / 2,
                width: length,
                height: lineWidth,
                borderRadius: lineWidth / 2,
                backgroundColor: alpha(c.onPrimary, 0.55),
                transform: [{ rotate: `${angle}deg` }],
              }}
            />
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm, width: boardWidth }}>
        <Button variant="ghost" icon="erase" label={labels.clear} onPress={rush.clear} disabled={!rush.path.length} style={{ flex: 1 }} />
        <Button label={labels.submitWord} icon="check" onPress={rush.submit} disabled={!rush.canSubmit || paused || ended} style={{ flex: 2 }} />
      </View>

      {state.found.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ alignSelf: 'stretch' }} contentContainerStyle={{ gap: 6 }}>
          {state.found
            .slice()
            .reverse()
            .map((w, k) => (
              <FadeSlide key={w} from={k === 0 ? 'left' : 'none'}>
                <View style={{ paddingVertical: 5, paddingHorizontal: 10, borderRadius: theme.radii.pill, backgroundColor: k === 0 ? alpha(c.success, 0.2) : c.surfaceAlt, borderWidth: 1, borderColor: k === 0 ? alpha(c.success, 0.5) : c.border }}>
                  <Text style={[{ color: c.text, fontSize: 13 }, font(theme, 'medium')]}>{w.toUpperCase()}</Text>
                </View>
              </FadeSlide>
            ))}
        </ScrollView>
      )}
    </View>
  );
}
