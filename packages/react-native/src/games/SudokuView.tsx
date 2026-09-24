import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { SudokuState } from '@sagegames/game-sudoku';
import { GameViewProps, SudokuCellInfo, useSudoku } from '@sagegames/react-headless';
import { Button, font, Stat, useBoardWidth } from '../ui/primitives';

export function SudokuView({ state, dispatch, theme, labels, paused, ended }: GameViewProps<SudokuState>) {
  const sudoku = useSudoku(state, dispatch);
  const { width: boardWidth, onLayout } = useBoardWidth(460, theme.spacing.lg);
  const c = theme.colors;
  const n = sudoku.size;
  const cellSize = Math.floor(boardWidth / n);
  const noteColumns = Math.ceil(Math.sqrt(n));

  const renderCell = (info: SudokuCellInfo) => {
    const bg = info.selected ? c.cellSelected : info.wrong ? c.cellConflict : info.sameValue ? c.cellSelected : info.peer ? c.cellPeer : c.surface;
    const thick = 2;
    const thin = 0.5;
    return (
      <Pressable
        key={info.index}
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
          borderTopColor: info.borders.top ? c.text : c.border,
          borderLeftColor: info.borders.left ? c.text : c.border,
          borderRightColor: info.borders.right ? c.text : c.border,
          borderBottomColor: info.borders.bottom ? c.text : c.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {paused ? null : info.value !== 0 ? (
          <Text
            style={[
              {
                fontSize: cellSize * 0.52,
                color: info.wrong ? c.danger : info.given ? c.text : c.primary,
                fontVariant: ['tabular-nums'],
              },
              font(theme, info.given ? 'bold' : 'medium'),
            ]}
          >
            {info.value}
          </Text>
        ) : info.notes.length > 0 ? (
          <View style={{ width: cellSize - 6, flexDirection: 'row', flexWrap: 'wrap' }}>
            {Array.from({ length: n }, (_, d) => (
              <Text
                key={d}
                style={{
                  width: (cellSize - 6) / noteColumns,
                  textAlign: 'center',
                  fontSize: Math.max(8, cellSize / (noteColumns * 1.6)),
                  color: c.textMuted,
                }}
              >
                {info.notes.includes(d + 1) ? d + 1 : ' '}
              </Text>
            ))}
          </View>
        ) : null}
      </Pressable>
    );
  };

  const padColumns = n <= 6 ? n : Math.ceil(n / 2);
  const padButton = Math.floor((boardWidth - (padColumns - 1) * 6) / padColumns);

  return (
    <View onLayout={onLayout} style={{ gap: theme.spacing.md, alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignSelf: 'stretch' }}>
        <Stat label={labels.mistakes} value={state.mistakes} align="center" />
        <Stat label={labels.hints} value={state.hintsUsed} align="center" />
      </View>

      <View style={{ width: cellSize * n, flexDirection: 'row', flexWrap: 'wrap', backgroundColor: c.border }}>
        {Array.from({ length: n * n }, (_, i) => renderCell(sudoku.cell(i)))}
      </View>

      <View style={{ width: boardWidth, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {Array.from({ length: n }, (_, d) => {
          const digit = d + 1;
          const done = sudoku.digitCounts[digit] >= n;
          return (
            <Pressable
              key={digit}
              accessibilityRole="button"
              accessibilityLabel={`${sudoku.notesMode ? 'Note' : 'Enter'} ${digit}`}
              disabled={paused || ended || done}
              onPress={() => sudoku.input(digit)}
              style={({ pressed }) => ({
                width: padButton,
                height: 52,
                borderRadius: theme.radii.md,
                backgroundColor: pressed ? c.cellSelected : c.surfaceAlt,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: done ? 0.35 : 1,
              })}
            >
              <Text style={[{ fontSize: 22, color: sudoku.notesMode ? c.textMuted : c.text }, font(theme, 'bold')]}>{digit}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm, width: boardWidth }}>
        <Button
          compact
          variant={sudoku.notesMode ? 'primary' : 'ghost'}
          label={`${labels.notes}: ${sudoku.notesMode ? 'on' : 'off'}`}
          onPress={sudoku.toggleNotes}
          style={{ flex: 1 }}
        />
        <Button compact variant="ghost" label={labels.erase} onPress={sudoku.erase} disabled={paused || ended} style={{ flex: 1 }} />
        <Button compact variant="ghost" label={labels.hint} onPress={sudoku.hint} disabled={paused || ended} style={{ flex: 1 }} />
      </View>
    </View>
  );
}
