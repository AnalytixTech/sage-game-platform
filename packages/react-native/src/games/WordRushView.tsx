import React, { useMemo, useRef } from 'react';
import { GestureResponderEvent, PanResponder, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import type { WordRushState } from '@sagegames/game-word-rush';
import { formatClock, GameViewProps, SageLabels, useWordRush } from '@sagegames/react-headless';
import { Button, font, ProgressBar, Stat } from '../ui/primitives';

const REJECTION_LABEL = (labels: SageLabels): Record<string, string> => ({
  not_adjacent: labels.notAdjacent,
  too_short: labels.tooShort,
  not_a_word: labels.notAWord,
  already_found: labels.alreadyFound,
});

export function WordRushView({ state, dispatch, elapsedMs, theme, labels, paused, ended }: GameViewProps<WordRushState>) {
  const rush = useWordRush(state, elapsedMs, dispatch);
  const { width } = useWindowDimensions();
  const c = theme.colors;
  const gap = 8;
  const boardWidth = Math.min(width - theme.spacing.lg * 2, 400);
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
  const lowTime = rush.remainingMs < 10_000;

  return (
    <View style={{ gap: theme.spacing.md, alignItems: 'center' }}>
      <View style={{ alignSelf: 'stretch', gap: theme.spacing.sm }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Stat label={labels.words} value={state.found.length} />
          <Stat label={labels.time} value={formatClock(rush.remainingMs)} align="flex-end" />
        </View>
        <ProgressBar fraction={rush.remainingMs / state.durationMs} color={lowTime ? c.danger : c.primary} />
      </View>

      <View
        style={{
          minHeight: 48,
          alignSelf: 'stretch',
          borderRadius: theme.radii.md,
          backgroundColor: c.surfaceAlt,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 12,
        }}
      >
        {rush.word ? (
          <Text style={[{ color: c.text, fontSize: 24, letterSpacing: 3 }, font(theme, 'bold')]}>{rush.word}</Text>
        ) : last ? (
          <Text style={[{ color: last.rejected ? c.danger : c.success, fontSize: 15 }, font(theme, 'medium')]}>
            {last.rejected
              ? `${last.word ? `${last.word.toUpperCase()}: ` : ''}${REJECTION_LABEL(labels)[last.rejected]}`
              : `${last.word.toUpperCase()} +${last.points}`}
          </Text>
        ) : (
          <Text style={[{ color: c.textMuted, fontSize: 14 }, font(theme, 'regular')]}>Drag through touching letters, or tap them</Text>
        )}
      </View>

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
            <View
              key={i}
              style={{
                width: tile,
                height: tile,
                borderRadius: theme.radii.md,
                backgroundColor: inPath ? c.primary : c.surface,
                borderWidth: isLast ? 3 : 1.5,
                borderColor: inPath ? c.primary : c.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={[{ color: inPath ? c.onPrimary : c.text, fontSize: tile * (face.length > 1 ? 0.34 : 0.44) }, font(theme, 'bold')]}>
                {paused ? '' : face === 'QU' ? 'Qu' : face}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm, width: boardWidth }}>
        <Button variant="ghost" label={labels.clear} onPress={rush.clear} disabled={!rush.path.length} style={{ flex: 1 }} />
        <Button label={labels.submitWord} onPress={rush.submit} disabled={!rush.canSubmit || paused || ended} style={{ flex: 2 }} />
      </View>

      {state.found.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ alignSelf: 'stretch' }} contentContainerStyle={{ gap: 6 }}>
          {state.found
            .slice()
            .reverse()
            .map((w) => (
              <View key={w} style={{ paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999, backgroundColor: c.surfaceAlt }}>
                <Text style={[{ color: c.text, fontSize: 13 }, font(theme, 'medium')]}>{w.toUpperCase()}</Text>
              </View>
            ))}
        </ScrollView>
      )}
    </View>
  );
}
