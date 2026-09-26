import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import type { MemoryMatchState } from '@sagegames/game-memory-match';
import { findEvent, gameAccent, GameViewProps, memoryEvents, SageTheme, useGameEvents, useMemoryBoard } from '@sagegames/react-headless';
import { alpha } from '@sagegames/react-headless';
import { FloatUp, gradientStyle, Icon, Pop, shadowStyle, Shake, Stat, useBoardWidth, useMotion } from '../ui/primitives';

function Card({
  index,
  face,
  faceUp,
  matched,
  mismatch,
  size,
  theme,
  popKey,
  shakeKey,
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
  popKey: number | null;
  shakeKey: number | null;
  onPress: () => void;
  disabled: boolean;
}) {
  const motion = useMotion();
  // Flip: turn to edge-on, swap sides, turn back (rotateY with perspective, native driver).
  const turn = useRef(new Animated.Value(0)).current;
  const shown = useRef(faceUp);
  const [visibleFaceUp, setVisibleFaceUp] = useState(faceUp);

  useEffect(() => {
    if (shown.current === faceUp) return;
    shown.current = faceUp;
    if (motion.reduced) {
      setVisibleFaceUp(faceUp);
      return;
    }
    const half = Math.max(60, motion.ms('fast'));
    Animated.timing(turn, { toValue: 1, duration: half, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => {
      setVisibleFaceUp(faceUp);
      Animated.timing(turn, { toValue: 0, duration: half, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }).start();
    });
  }, [faceUp, turn, motion]);

  const c = theme.colors;
  const accent = gameAccent(theme, 'game_memory_001');
  const rotateY = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] });
  const height = size * 1.22;

  const back = (
    <View style={[{ flex: 1, borderRadius: theme.radii.md, padding: 5 }, gradientStyle([accent, c.primaryAlt])]}>
      <View style={{ flex: 1, borderRadius: Math.max(4, theme.radii.md - 4), borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.28)', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: size * 0.3 }}>✦</Text>
      </View>
    </View>
  );

  const front = (
    <View
      style={[
        {
          flex: 1,
          borderRadius: theme.radii.md,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 2,
          borderColor: matched ? c.success : mismatch ? c.danger : c.border,
          backgroundColor: matched ? alpha(c.success, 0.16) : mismatch ? c.cellConflict : c.surfaceRaised,
        },
      ]}
    >
      <Text style={{ fontSize: size * 0.5 }}>{face}</Text>
      {matched && (
        <View style={{ position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: 9, backgroundColor: c.success, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="check" size={11} color="#ffffff" style={{ fontWeight: '800' }} />
        </View>
      )}
    </View>
  );

  return (
    <Shake trigger={shakeKey}>
      <Pop trigger={popKey} peak={1.12}>
        <Pressable
          testID={`memory-card-${index}`}
          accessibilityRole="button"
          accessibilityLabel={visibleFaceUp ? face : 'Hidden card'}
          onPress={onPress}
          disabled={disabled || faceUp}
        >
          <Animated.View
            style={[
              { width: size, height, borderRadius: theme.radii.md, transform: [{ perspective: 800 }, { rotateY }] },
              shadowStyle(theme, visibleFaceUp ? 'sm' : 'md'),
            ]}
          >
            {visibleFaceUp ? front : back}
          </Animated.View>
        </Pressable>
      </Pop>
    </Shake>
  );
}

export function MemoryView({ state, dispatch, elapsedMs, theme, labels, paused, ended }: GameViewProps<MemoryMatchState>) {
  const board = useMemoryBoard(state, elapsedMs, dispatch);
  const { events, seq } = useGameEvents(state, memoryEvents);
  const { width: boardWidth, onLayout } = useBoardWidth(460, theme.spacing.lg);
  const gap = theme.spacing.sm;
  const cardSize = Math.floor((boardWidth - gap * (board.columns - 1)) / board.columns);

  const match = findEvent(events, 'match');
  const miss = findEvent(events, 'miss');

  return (
    <View onLayout={onLayout} style={{ gap: theme.spacing.lg, alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignSelf: 'stretch' }}>
        <Stat label={labels.pairs} value={`${state.matchedPairs}/${state.pairCount}`} align="center" icon="star" />
        <Stat label={labels.moves} value={state.moves} align="center" />
      </View>
      <View style={{ width: boardWidth }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
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
              popKey={match?.cells.includes(i) ? seq : null}
              shakeKey={miss?.cells.includes(i) ? seq : null}
              disabled={paused || ended}
              onPress={() => board.flip(i)}
            />
          ))}
        </View>
        <FloatUp trigger={match ? seq : null} text={match ? `+${match.points}` : ''} style={{ top: '40%' }} />
      </View>
    </View>
  );
}
