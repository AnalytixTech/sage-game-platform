import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import type { SudokuState } from '@sagegames/game-sudoku';
import { alpha, GameEvent, GameViewProps, SudokuCellInfo, sudokuEvents, useGameEvents, useSudoku } from '@sagegames/react-headless';
import { Button, font, Pop, shadowStyle, Shake, Stat, useBoardWidth, useMotion } from '../ui/primitives';

/** A light wash over a cell that fades out (completed row/column/box), staggered into a sweep. */
function Flash({ trigger, delay, color }: { trigger: number | null; delay: number; color: string }) {
  const motion = useMotion();
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (trigger === null || motion.reduced) return;
    opacity.setValue(0);
    Animated.sequence([
      Animated.delay(delay),
      Animated.timing(opacity, { toValue: 0.75, duration: 120, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 520, useNativeDriver: true }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);
  return <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: color, opacity }} />;
}

export function SudokuView({ state, dispatch, theme, labels, paused, ended }: GameViewProps<SudokuState>) {
  const sudoku = useSudoku(state, dispatch);
  const { events, seq } = useGameEvents(state, sudokuEvents);
  const { width: boardWidth, onLayout } = useBoardWidth(460, theme.spacing.lg);
  const c = theme.colors;
  const n = sudoku.size;
  const cellSize = Math.floor((boardWidth - 4) / n);
  const noteColumns = Math.ceil(Math.sqrt(n));
  const regionLine = alpha(c.text, 0.4);

  // Which cells animate this time: popped, shaken, or swept (with their position in the sweep).
  const popped = new Set<number>();
  const shaken = new Set<number>();
  const sweep = new Map<number, number>();
  events.forEach((e: GameEvent) => {
    if (e.kind === 'placed' || e.kind === 'hint') popped.add(e.cell);
    if (e.kind === 'mistake') shaken.add(e.cell);
    if (e.kind === 'unitComplete') e.cells.forEach((cell, order) => sweep.set(cell, Math.min(sweep.get(cell) ?? Infinity, order)));
  });

  const renderCell = (info: SudokuCellInfo) => {
    const bg = info.selected ? c.cellSelected : info.wrong ? c.cellConflict : info.sameValue ? alpha(c.primary, 0.22) : info.peer ? c.cellPeer : c.surface;
    const thick = 2;
    const thin = 0.5;
    return (
      <Shake key={info.index} trigger={shaken.has(info.index) ? seq : null}>
        <Pressable
          testID={`sudoku-cell-${info.index}`}
          accessibilityRole="button"
          accessibilityLabel={`Row ${Math.floor(info.index / n) + 1} column ${(info.index % n) + 1}${info.value ? `, ${info.value}` : ', empty'}`}
          onPress={() => sudoku.select(info.index)}
          style={{
            width: cellSize,
            height: cellSize,
            backgroundColor: bg,
            borderTopWidth: info.borders.top ? thick : thin,
            borderLeftWidth: info.borders.left ? thick : thin,
            borderRightWidth: info.borders.right ? thick : thin,
            borderBottomWidth: info.borders.bottom ? thick : thin,
            borderTopColor: info.borders.top ? regionLine : c.border,
            borderLeftColor: info.borders.left ? regionLine : c.border,
            borderRightColor: info.borders.right ? regionLine : c.border,
            borderBottomColor: info.borders.bottom ? regionLine : c.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Flash trigger={sweep.has(info.index) ? seq : null} delay={(sweep.get(info.index) ?? 0) * 45} color={alpha(c.success, 0.55)} />
          {info.selected && (
            <View pointerEvents="none" style={{ position: 'absolute', top: 1, left: 1, right: 1, bottom: 1, borderWidth: 2, borderColor: c.primary, borderRadius: 4 }} />
          )}
          {paused ? null : info.value !== 0 ? (
            <Pop trigger={popped.has(info.index) ? seq : null} peak={1.3}>
              <Text
                style={[
                  { fontSize: cellSize * 0.52, color: info.wrong ? c.danger : info.given ? c.text : c.primary, fontVariant: ['tabular-nums'] },
                  font(theme, info.given ? 'bold' : 'medium'),
                ]}
              >
                {info.value}
              </Text>
            </Pop>
          ) : info.notes.length > 0 ? (
            <View style={{ width: cellSize - 6, flexDirection: 'row', flexWrap: 'wrap' }}>
              {Array.from({ length: n }, (_, d) => (
                <Text
                  key={d}
                  style={{ width: (cellSize - 6) / noteColumns, textAlign: 'center', fontSize: Math.max(8, cellSize / (noteColumns * 1.6)), color: c.textMuted }}
                >
                  {info.notes.includes(d + 1) ? d + 1 : ' '}
                </Text>
              ))}
            </View>
          ) : null}
        </Pressable>
      </Shake>
    );
  };

  const padColumns = n <= 6 ? n : Math.ceil(n / 2);
  const padButton = Math.floor((boardWidth - (padColumns - 1) * 8) / padColumns);

  return (
    <View onLayout={onLayout} style={{ gap: theme.spacing.md, alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignSelf: 'stretch' }}>
        <Stat label={labels.mistakes} value={state.mistakes} align="center" icon="cross" />
        <Stat label={labels.hints} value={state.hintsUsed} align="center" icon="bulb" />
      </View>

      <View
        style={[
          { padding: 2, borderRadius: theme.radii.md, backgroundColor: regionLine, overflow: 'hidden' },
          shadowStyle(theme, 'md'),
        ]}
      >
        <View style={{ width: cellSize * n, flexDirection: 'row', flexWrap: 'wrap', backgroundColor: c.border, borderRadius: Math.max(2, theme.radii.md - 2), overflow: 'hidden' }}>
          {Array.from({ length: n * n }, (_, i) => renderCell(sudoku.cell(i)))}
        </View>
      </View>

      <View style={{ width: boardWidth, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {Array.from({ length: n }, (_, d) => {
          const digit = d + 1;
          const left = Math.max(0, n - sudoku.digitCounts[digit]);
          const done = left === 0;
          return (
            <Pressable
              key={digit}
              accessibilityRole="button"
              accessibilityLabel={`${sudoku.notesMode ? 'Note' : 'Enter'} ${digit}`}
              disabled={paused || ended || done}
              onPress={() => sudoku.input(digit)}
              style={({ pressed }) => [
                {
                  width: padButton,
                  height: 56,
                  borderRadius: theme.radii.md,
                  backgroundColor: pressed ? c.cellSelected : c.surfaceAlt,
                  borderWidth: 1,
                  borderColor: pressed ? c.primary : c.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: done ? 0.35 : 1,
                  transform: [{ scale: pressed ? 0.94 : 1 }],
                },
                pressed ? null : shadowStyle(theme, 'sm'),
              ]}
            >
              <Text style={[{ fontSize: 22, color: sudoku.notesMode ? c.textMuted : c.text }, font(theme, 'bold')]}>{digit}</Text>
              <Text style={[{ fontSize: 10, color: c.textMuted, marginTop: -2 }, font(theme, 'medium')]}>{done ? '✓' : left}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm, width: boardWidth }}>
        <Button
          compact
          icon="pencil"
          variant={sudoku.notesMode ? 'primary' : 'ghost'}
          label={labels.notes}
          accessibilityLabel={`${labels.notes}: ${sudoku.notesMode ? 'on' : 'off'}`}
          onPress={sudoku.toggleNotes}
          style={{ flex: 1 }}
        />
        <Button compact icon="erase" variant="ghost" label={labels.erase} onPress={sudoku.erase} disabled={paused || ended} style={{ flex: 1 }} />
        <Button compact icon="bulb" variant="ghost" label={labels.hint} onPress={sudoku.hint} disabled={paused || ended} style={{ flex: 1 }} />
      </View>
    </View>
  );
}
