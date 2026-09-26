import React from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { Game, GameCategory } from '@sagegames/types';
import { gameAccent, gameGlyph, mix, useGames, useSage } from '@sagegames/react-headless';
import { Body, FadeSlide, gradientStyle, Loading, shadowStyle, typeStyle, useBoardWidth, usePressScale } from './ui/primitives';

function Tile({ game, title, width, index, onPress }: { game: Game; title: string; width: number; index: number; onPress: () => void }) {
  const { theme } = useSage();
  const press = usePressScale(0.96);
  const c = theme.colors;
  const accent = gameAccent(theme, game.id);
  return (
    <FadeSlide delay={index * 60} style={{ width }}>
      <Animated.View style={press.style}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={title}
          onPress={onPress}
          {...press.handlers}
          style={[{ borderRadius: theme.radii.lg, overflow: 'hidden', backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }, shadowStyle(theme, 'md')]}
        >
          <View style={[{ height: 92, alignItems: 'center', justifyContent: 'center' }, gradientStyle([accent, mix(accent, c.surface, 0.5)])]}>
            <Text style={{ fontSize: 40 }}>{gameGlyph(game.id)}</Text>
          </View>
          <View style={{ padding: theme.spacing.md, gap: 4 }}>
            <Text numberOfLines={1} style={[typeStyle(theme, theme.typography.heading), { color: c.text, fontSize: 16 }]}>
              {title}
            </Text>
            <Text numberOfLines={2} style={[typeStyle(theme, theme.typography.caption), { color: c.textMuted, letterSpacing: 0, fontWeight: '400', fontSize: 13 }]}>
              {game.description}
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    </FadeSlide>
  );
}

/** Games this app can play (from the public catalog), as a two-column grid of tiles. */
export function GameCatalog({ onSelectGame, category }: { onSelectGame: (game: Game) => void; category?: GameCategory }) {
  const { theme, labels, plugins } = useSage();
  const { games, loading, error } = useGames({ category });
  const { width, onLayout } = useBoardWidth(720, theme.spacing.lg);
  if (loading) return <Loading label={labels.loading} />;
  if (error) return <Body muted>{error.message}</Body>;
  const gap = theme.spacing.md;
  const columns = width >= 520 ? 3 : 2;
  const tile = Math.floor((width - gap * (columns - 1)) / columns);
  return (
    <View onLayout={onLayout} style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
      {games.map((g, i) => (
        <Tile key={g.id} game={g} index={i} width={tile} title={plugins.get(g.id)?.title ?? g.name} onPress={() => onSelectGame(g)} />
      ))}
    </View>
  );
}
