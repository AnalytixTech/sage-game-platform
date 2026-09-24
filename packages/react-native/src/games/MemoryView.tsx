import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, useWindowDimensions, View } from 'react-native';
import type { MemoryMatchState } from '@sagegames/game-memory-match';
import { GameViewProps, SageTheme, useMemoryBoard } from '@sagegames/react-headless';
import { font, Stat } from '../ui/primitives';

function Card({
  index,
  face,
  faceUp,
  matched,
  mismatch,
  size,
  theme,
  onPress,
  disabled,
}: {
  index: number;
  face: string;
  faceUp: boolean;
  matched: boolean;
  mismatch: boolean;
  size: number;
  theme: SageTheme;
  onPress: () => void;
  disabled: boolean;
}) {
  // Flip: squash to zero width, swap the face, expand again.
  const scale = useRef(new Animated.Value(1)).current;
  const shown = useRef(faceUp);
  const [visibleFaceUp, setVisibleFaceUp] = React.useState(faceUp);

  useEffect(() => {
    if (shown.current === faceUp) return;
    shown.current = faceUp;
    Animated.timing(scale, { toValue: 0, duration: 90, useNativeDriver: true }).start(() => {
      setVisibleFaceUp(faceUp);
      Animated.timing(scale, { toValue: 1, duration: 110, useNativeDriver: true }).start();
    });
  }, [faceUp, scale]);

  const c = theme.colors;
  const background = !visibleFaceUp ? c.primary : matched ? c.highlight : mismatch ? c.cellConflict : c.surface;

  return (
    <Pressable
      testID={`memory-card-${index}`}
      accessibilityRole="button"
      accessibilityLabel={visibleFaceUp ? face : 'Hidden card'}
      onPress={onPress}
      disabled={disabled || faceUp}
    >
      <Animated.View
        style={{
          width: size,
          height: size * 1.2,
          borderRadius: theme.radii.md,
          backgroundColor: background,
          borderWidth: 1.5,
          borderColor: visibleFaceUp ? (mismatch ? c.danger : c.border) : c.primary,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ scaleX: scale }],
        }}
      >
        <Text style={{ fontSize: size * 0.48 }}>{visibleFaceUp ? face : ''}</Text>
        {!visibleFaceUp && <Text style={[{ color: c.onPrimary, fontSize: size * 0.3, opacity: 0.6 }, font(theme, 'bold')]}>?</Text>}
      </Animated.View>
    </Pressable>
  );
}

export function MemoryView({ state, dispatch, elapsedMs, theme, labels, paused, ended }: GameViewProps<MemoryMatchState>) {
  const board = useMemoryBoard(state, elapsedMs, dispatch);
  const { width } = useWindowDimensions();
  const gap = theme.spacing.sm;
  const boardWidth = Math.min(width - theme.spacing.lg * 2, 460);
  const cardSize = Math.floor((boardWidth - gap * (board.columns - 1)) / board.columns);

  return (
    <View style={{ gap: theme.spacing.lg, alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignSelf: 'stretch' }}>
        <Stat label={labels.pairs} value={`${state.matchedPairs}/${state.pairCount}`} align="center" />
        <Stat label={labels.moves} value={state.moves} align="center" />
      </View>
      <View style={{ width: boardWidth, flexDirection: 'row', flexWrap: 'wrap', gap }}>
        {state.cards.map((card, i) => (
          <Card
            key={i}
            index={i}
            face={card.face}
            faceUp={board.isFaceUp(i) && !paused}
            matched={card.matched}
            mismatch={board.isMismatch(i)}
            size={cardSize}
            theme={theme}
            disabled={paused || ended}
            onPress={() => board.flip(i)}
          />
        ))}
      </View>
    </View>
  );
}
