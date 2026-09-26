import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, GestureResponderEvent, PanResponder, Text, View } from 'react-native';
import type { WordSearchState } from '@sagegames/game-word-search';
import { alpha, findEvent, GameViewProps, GridCell, useGameEvents, useWordSearch, wordSearchEvents } from '@sagegames/react-headless';
import { Body, font, FloatUp, Pop, shadowStyle, Shake, Stat, useBoardWidth, useMotion } from '../ui/primitives';

/** A rounded bar from the centre of one cell to another, at any angle, drawn under the letters. */
function Capsule({ from, to, cellSize, size, color, border, grow }: { from: number; to: number; cellSize: number; size: number; color: string; border?: string; grow?: boolean }) {
  const motion = useMotion();
  const scale = useRef(new Animated.Value(grow && !motion.reduced ? 0.2 : 1)).current;
  useEffect(() => {
    if (!grow || motion.reduced) return;
    Animated.timing(scale, { toValue: 1, duration: motion.ms('base'), easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [r1, c1, r2, c2] = [Math.floor(from / size), from % size, Math.floor(to / size), to % size];
  const x1 = (c1 + 0.5) * cellSize;
  const y1 = (r1 + 0.5) * cellSize;
  const x2 = (c2 + 0.5) * cellSize;
  const y2 = (r2 + 0.5) * cellSize;
  const thickness = cellSize * 0.8;
  const length = Math.hypot(x2 - x1, y2 - y1) + thickness;
  const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: (x1 + x2) / 2 - length / 2,
        top: (y1 + y2) / 2 - thickness / 2,
        width: length,
        height: thickness,
        borderRadius: thickness / 2,
        backgroundColor: color,
        borderWidth: border ? 2 : 0,
        borderColor: border,
        transform: [{ rotate: `${angle}deg` }, { scaleX: scale }],
      }}
    />
  );
}

export function WordSearchView({ state, dispatch, theme, labels, paused, ended }: GameViewProps<WordSearchState>) {
  const ws = useWordSearch(state, dispatch);
  const { events, seq } = useGameEvents(state, wordSearchEvents);
  const { width: maxWidth, onLayout } = useBoardWidth(480, theme.spacing.lg);
  const c = theme.colors;
  const palette = c.foundPalette.length ? c.foundPalette : ['#fde68a'];
  const BORDER = 1;
  const PAD = 6;
  // Whole-pixel cells that fit inside the border and padding, so rows never wrap early.
  const cellSize = Math.floor((maxWidth - (BORDER + PAD) * 2) / state.size);
  const gridWidth = cellSize * state.size;
  const boardWidth = gridWidth + (BORDER + PAD) * 2;

  // Children never take touches (box-only), so locationX/Y are relative to the grid itself.
  const cellAt = (e: GestureResponderEvent): GridCell | null => {
    const { locationX, locationY } = e.nativeEvent;
    const col = Math.floor((locationX - PAD) / cellSize);
    const row = Math.floor((locationY - PAD) / cellSize);
    if (row < 0 || col < 0 || row >= state.size || col >= state.size) return null;
    return [row, col];
  };

  const handlers = useRef(ws);
  handlers.current = ws;
  const disabled = paused || ended;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabledRef.current,
        onMoveShouldSetPanResponder: () => !disabledRef.current,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          const cell = cellAt(e);
          if (cell) handlers.current.pointerDown(cell);
        },
        onPanResponderMove: (e) => {
          const cell = cellAt(e);
          if (cell) handlers.current.pointerMove(cell);
        },
        onPanResponderRelease: (e) => handlers.current.pointerUp(cellAt(e)),
        onPanResponderTerminate: () => handlers.current.cancel(),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cellSize, state.size]
  );

  const found = findEvent(events, 'wordFound');
  const preview = [...ws.preview];

  return (
    <View onLayout={onLayout} style={{ gap: theme.spacing.md, alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignSelf: 'stretch' }}>
        <Stat label={labels.found} value={`${state.foundCount}/${state.words.length}`} align="center" icon="star" />
      </View>

      <Shake trigger={findEvent(events, 'noWord') ? seq : null}>
        <View
          {...responder.panHandlers}
          pointerEvents="box-only"
          accessibilityLabel={`${state.categoryName} word search grid`}
          style={[
            {
              width: boardWidth,
              height: boardWidth,
              padding: PAD,
              backgroundColor: c.surface,
              borderRadius: theme.radii.lg,
              borderWidth: BORDER,
              borderColor: c.border,
              overflow: 'hidden',
            },
            shadowStyle(theme, 'md'),
          ]}
        >
          {/* The letters: exactly size × size cells (tests locate cells from this box). */}
          <View testID="word-search-grid" style={{ width: gridWidth, height: gridWidth, flexDirection: 'row', flexWrap: 'wrap' }}>
            {!paused &&
              state.words.map((w, i) =>
                w.found && w.cells.length ? (
                  <Capsule
                    key={w.token}
                    from={w.cells[0]}
                    to={w.cells[w.cells.length - 1]}
                    cellSize={cellSize}
                    size={state.size}
                    color={alpha(palette[i % palette.length], 0.92)}
                    grow={found?.word === i}
                  />
                ) : null
              )}
            {preview.length > 0 && (
              <Capsule from={preview[0]} to={preview[preview.length - 1]} cellSize={cellSize} size={state.size} color={alpha(c.primary, 0.35)} border={c.primary} />
            )}
            {state.grid.flatMap((row, r) =>
              row.map((letter, col) => {
                const i = r * state.size + col;
                const inFound = ws.foundCells.has(i);
                const selecting = ws.preview.has(i);
                return (
                  <View key={i} style={{ width: cellSize, height: cellSize, alignItems: 'center', justifyContent: 'center' }}>
                    <Text
                      style={[
                        { fontSize: cellSize * 0.48, color: inFound && !selecting ? '#1f2937' : c.text, opacity: inFound || selecting ? 1 : 0.9 },
                        font(theme, selecting || inFound ? 'bold' : 'medium'),
                      ]}
                    >
                      {paused ? '' : letter}
                    </Text>
                  </View>
                );
              })
            )}
          </View>
        </View>
      </Shake>
      <View style={{ height: 0, width: boardWidth }}>
        <FloatUp trigger={found ? seq : null} text={found ? `+${found.points}` : ''} style={{ top: -boardWidth / 2 }} />
      </View>

      <Body muted center style={{ fontSize: 13 }}>
        Drag across a word, or tap its first and last letters.
      </Body>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', width: boardWidth }}>
        {state.words.map((w, i) => (
          <Pop key={w.token} trigger={found?.word === i ? seq : null} peak={1.2}>
            <View
              style={{
                paddingVertical: 6,
                paddingHorizontal: 12,
                borderRadius: theme.radii.pill,
                backgroundColor: w.found ? palette[i % palette.length] : c.surfaceAlt,
                borderWidth: 1,
                borderColor: w.found ? 'transparent' : c.border,
              }}
            >
              <Text style={[{ color: w.found ? '#1f2937' : c.text, fontSize: 14, textDecorationLine: w.found ? 'line-through' : 'none' }, font(theme, 'medium')]}>
                {w.display}
              </Text>
            </View>
          </Pop>
        ))}
      </View>

      {state.skippedWords.length > 0 && (
        <Body muted center style={{ fontSize: 12 }}>
          {labels.skippedWords}: {state.skippedWords.join(', ')}
        </Body>
      )}
    </View>
  );
}
