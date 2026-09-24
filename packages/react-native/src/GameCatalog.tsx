import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Game, GameCategory } from '@sagegames/types';
import { useGames, useSage } from '@sagegames/react-headless';
import { Body, font, Loading } from './ui/primitives';

/** List of games this app can play (from the public catalog). */
export function GameCatalog({ onSelectGame, category }: { onSelectGame: (game: Game) => void; category?: GameCategory }) {
  const { theme, labels, plugins } = useSage();
  const { games, loading, error } = useGames({ category });
  const c = theme.colors;
  if (loading) return <Loading label={labels.loading} />;
  if (error) return <Body muted>{error.message}</Body>;
  return (
    <View style={{ gap: theme.spacing.sm }}>
      {games.map((g) => (
        <Pressable
          key={g.id}
          accessibilityRole="button"
          onPress={() => onSelectGame(g)}
          style={({ pressed }) => ({
            backgroundColor: pressed ? c.surfaceAlt : c.surface,
            borderColor: c.border,
            borderWidth: 1,
            borderRadius: theme.radii.lg,
            padding: theme.spacing.lg,
            gap: 4,
          })}
        >
          <Text style={[{ color: c.text, fontSize: 17 }, font(theme, 'bold')]}>{plugins.get(g.id)?.title ?? g.name}</Text>
          <Text style={[{ color: c.textMuted, fontSize: 14 }, font(theme, 'regular')]}>{g.description}</Text>
        </Pressable>
      ))}
    </View>
  );
}
