import React, { useMemo, useRef } from 'react';
import { GestureResponderEvent, PanResponder, Text, View } from 'react-native';
import type { WordSearchState } from '@sagegames/game-word-search';
import { GameViewProps, GridCell, useWordSearch } from '@sagegames/react-headless';
import { Body, font, Stat, useBoardWidth } from '../ui/primitives';

/** Soft colours for found words (overlaid on the theme's highlight). */
const FOUND_COLORS = ['#fde68a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#ddd6fe', '#fed7aa', '#a7f3d0', '#c7d2fe'];

export function WordSearchView({ state, dispatch, theme, labels, paused, ended }: GameViewProps<WordSearchState>) {
  const ws = useWordSearch(state, dispatch);
  const { width: maxWidth, onLayout } = useBoardWidth(480, theme.spacing.lg);
  const c = theme.colors;
  const BORDER = 1;
  // Whole-pixel cells that fit inside the border, so rows never wrap early.
  const cellSize = Math.floor((maxWidth - BORDER * 2) / state.size);
  const boardWidth = cellSize * state.size + BORDER * 2;

  // Children never take touches (box-only), so locationX/Y are relative to the grid itself.
  const cellAt = (e: GestureResponderEvent): GridCell | null => {
    const { locationX, locationY } = e.nativeEvent;
    const col = Math.floor(locationX / cellSize);
    const row = Math.floor(locationY / cellSize);
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

  return (
    <View onLayout={onLayout} style={{ gap: theme.spacing.md, alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignSelf: 'stretch' }}>
        <Stat label={labels.found} value={`${state.foundCount}/${state.words.length}`} align="center" />
      </View>

      <View
        {...responder.panHandlers}
        pointerEvents="box-only"
        testID="word-search-grid"
        accessibilityLabel={`${state.categoryName} word search grid`}
        style={{
          width: boardWidth,
          height: boardWidth,
          flexDirection: 'row',
          flexWrap: 'wrap',
          backgroundColor: c.surface,
          borderRadius: theme.radii.md,
          borderWidth: BORDER,
          borderColor: c.border,
          overflow: 'hidden',
        }}
      >
        {state.grid.flatMap((row, r) =>
          row.map((letter, col) => {
            const i = r * state.size + col;
            const found = ws.foundCells.get(i);
            const selecting = ws.preview.has(i);
            return (
              <View
                key={i}
                style={{
                  width: cellSize,
                  height: cellSize,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: selecting ? c.cellSelected : found !== undefined ? FOUND_COLORS[found % FOUND_COLORS.length] : 'transparent',
                }}
              >
                <Text
                  style={[
                    { fontSize: cellSize * 0.5, color: found !== undefined && !selecting ? '#1f2937' : c.text },
                    font(theme, selecting ? 'bold' : 'medium'),
                  ]}
                >
                  {paused ? '' : letter}
                </Text>
              </View>
            );
          })
        )}
      </View>

      <Body muted center style={{ fontSize: 13 }}>
        Drag across a word, or tap its first and last letters.
      </Body>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', width: boardWidth }}>
        {state.words.map((w, i) => (
          <View
            key={w.token}
            style={{
              paddingVertical: 6,
              paddingHorizontal: 10,
              borderRadius: 999,
              backgroundColor: w.found ? FOUND_COLORS[i % FOUND_COLORS.length] : c.surfaceAlt,
            }}
          >
            <Text
              style={[
                {
                  color: w.found ? '#1f2937' : c.text,
                  fontSize: 14,
                  textDecorationLine: w.found ? 'line-through' : 'none',
                },
                font(theme, 'medium'),
              ]}
            >
              {w.display}
            </Text>
          </View>
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
