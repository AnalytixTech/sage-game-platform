import React from 'react';
import { View } from 'react-native';
import { GamePlugin, useLocalGame, useSage } from '@sagegames/react-headless';

/**
 * Renders a game locally with no session (demos, tutorials, design work).
 * Scores are not submitted or verified.
 */
export function GamePreview({ plugin, seed = 'preview', config }: { plugin: GamePlugin; seed?: string; config?: Record<string, unknown> }) {
  const { theme, labels } = useSage();
  const { runtime, snapshot } = useLocalGame(plugin.rules, seed, config);
  const View_ = plugin.View;
  return (
    <View style={{ padding: theme.spacing.lg, backgroundColor: theme.colors.background }}>
      <View_
        state={snapshot.state}
        dispatch={(type, payload) => runtime.dispatch(type, payload)}
        elapsedMs={snapshot.elapsedMs}
        paused={snapshot.paused}
        ended={snapshot.ended}
        theme={theme}
        labels={labels}
      />
    </View>
  );
}
