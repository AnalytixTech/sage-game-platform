import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import {
  Game as GameMetadata,
  GameCategory,
  GameEvent,
  GameResult,
  GameModule,
  GameState,
  GameAction,
} from '@sagegames/types';
import { useGames, useSageGameContext } from '@sagegames/react';
import { GameLifecycleManager } from '@sagegames/core';

// Re-export shared providers and hooks from @sagegames/react for identical API surface
export {
  SageGameProvider,
  useSageGameContext,
  useGames,
  useGame,
  useGameSession,
  useGameState,
  useGameResult,
} from '@sagegames/react';

export interface RNGameCatalogProps {
  onSelectGame?: (game: GameMetadata) => void;
  category?: GameCategory;
}

/**
 * React Native GameCatalog component using 100% native View/Text/FlatList primitives
 */
export const GameCatalog: React.FC<RNGameCatalogProps> = ({ onSelectGame, category }) => {
  const { games, loading, error } = useGames({ category });

  if (loading) {
    return React.createElement(
      View,
      { style: styles.centerContainer },
      React.createElement(ActivityIndicator, { size: 'large', color: '#4f46e5' }),
      React.createElement(Text, { style: styles.loadingText }, 'Loading Games for Mobile...')
    );
  }

  if (error) {
    return React.createElement(
      View,
      { style: styles.errorContainer },
      React.createElement(Text, { style: styles.errorText }, `Error: ${error.message}`)
    );
  }

  return React.createElement(FlatList, {
    data: games,
    keyExtractor: (item: GameMetadata) => item.id,
    contentContainerStyle: styles.listContent,
    renderItem: ({ item }: { item: GameMetadata }) =>
      React.createElement(
        TouchableOpacity,
        {
          style: styles.card,
          onPress: () => onSelectGame?.(item),
          activeOpacity: 0.7,
        },
        React.createElement(Text, { style: styles.cardTitle }, item.name),
        React.createElement(Text, { style: styles.cardDescription }, item.description || ''),
        React.createElement(
          Text,
          { style: styles.cardCategory },
          `${item.category.toUpperCase()} • VERSION ${item.version}`
        )
      ),
  });
};

export interface RNGameLauncherProps {
  gameId: string;
  sessionToken?: string;
  config?: Record<string, unknown>;
  onComplete?: (result: GameResult<any>) => void;
  onError?: (error: Error) => void;
  onEvent?: (event: GameEvent) => void;
}

/**
 * React Native GameLauncher component using 100% native View/Text primitives
 */
export const GameLauncher: React.FC<RNGameLauncherProps> = ({
  gameId,
  sessionToken: overrideToken,
  config = {},
  onComplete,
  onError,
  onEvent,
}) => {
  const { client, sessionToken: contextToken, registeredModules } = useSageGameContext();
  const effectiveToken = overrideToken || contextToken;

  const [loading, setLoading] = useState<boolean>(true);
  const [errorState, setErrorState] = useState<string | null>(null);
  const [currentGameState, setCurrentGameState] = useState<GameState | null>(null);

  const managerRef = useRef<GameLifecycleManager<any, any, any, any> | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function initAndStartGame() {
      if (!effectiveToken) {
        const err = new Error('Missing session token for Mobile GameLauncher');
        setErrorState(err.message);
        onError?.(err);
        setLoading(false);
        return;
      }

      const module: GameModule<any, any, any, any> | undefined = registeredModules.get(gameId);

      if (!module) {
        const err = new Error(`Game module '${gameId}' is not registered in SageGameProvider`);
        setErrorState(err.message);
        onError?.(err);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        client.setSessionToken(effectiveToken);

        const manager = new GameLifecycleManager(module);
        managerRef.current = manager;

        manager.eventEmitter.on('all', (evt: GameEvent) => {
          onEvent?.(evt);
          if (evt.type === 'game_completed' && onComplete) {
            onComplete(evt.result);
          }
        });

        await manager.initialize({
          sessionId: `sess_rn_${Date.now()}`,
          gameId,
          externalUserId: 'user_mobile',
          platform: 'ios',
          config,
          sessionToken: effectiveToken,
          onEvent: (evt: GameEvent) => manager.eventEmitter.emit(evt),
        });

        await manager.start();

        if (isMounted) {
          setCurrentGameState(manager.getGameState());
          setLoading(false);
        }
      } catch (err: any) {
        const e = err instanceof Error ? err : new Error(String(err));
        if (isMounted) {
          setErrorState(e.message);
          onError?.(e);
          setLoading(false);
        }
      }
    }

    initAndStartGame();

    return () => {
      isMounted = false;
      if (managerRef.current) {
        managerRef.current.destroy();
      }
    };
  }, [gameId, effectiveToken]);

  const handleAction = async (actionType: string, payload: unknown) => {
    if (!managerRef.current) return;
    const action: GameAction = {
      type: actionType,
      payload,
      timestamp: Date.now(),
    };
    await managerRef.current.submitAction(action);
    setCurrentGameState({ ...managerRef.current.getGameState() });
  };

  const handleFinish = async () => {
    if (!managerRef.current) return;
    const result = await managerRef.current.complete();
    onComplete?.(result);
  };

  if (loading) {
    return React.createElement(
      View,
      { style: styles.centerContainer },
      React.createElement(ActivityIndicator, { size: 'large', color: '#4f46e5' }),
      React.createElement(Text, { style: styles.loadingText }, `Initializing ${gameId}...`)
    );
  }

  if (errorState) {
    return React.createElement(
      View,
      { style: styles.errorCard },
      React.createElement(Text, { style: styles.errorCardTitle }, 'Game Error'),
      React.createElement(Text, { style: styles.errorCardText }, errorState)
    );
  }

  return React.createElement(
    View,
    { style: styles.launcherCard },
    React.createElement(
      View,
      { style: styles.launcherHeader },
      React.createElement(Text, { style: styles.launcherTitle }, `Mobile Engine: ${gameId}`),
      React.createElement(Text, { style: styles.scoreText }, `Score: ${currentGameState?.currentScore ?? 0}`)
    ),
    React.createElement(
      View,
      { style: styles.stateContainer },
      React.createElement(Text, { style: styles.stateTitle }, 'Active Session Data:'),
      React.createElement(Text, { style: styles.stateData }, JSON.stringify(currentGameState?.data, null, 2))
    ),
    React.createElement(
      View,
      { style: styles.buttonRow },
      React.createElement(
        TouchableOpacity,
        {
          style: styles.primaryButton,
          onPress: () => handleAction('INTERACT', { timestamp: Date.now() }),
        },
        React.createElement(Text, { style: styles.buttonText }, 'Submit Action')
      ),
      React.createElement(
        TouchableOpacity,
        {
          style: styles.successButton,
          onPress: handleFinish,
        },
        React.createElement(Text, { style: styles.buttonText }, 'Complete Game')
      )
    )
  );
};

export interface RNGameProps {
  gameId: string;
  sessionToken?: string;
  config?: Record<string, unknown>;
  onComplete?: (result: GameResult<any>) => void;
  onError?: (error: Error) => void;
  onEvent?: (event: GameEvent) => void;
}

export const Game: React.FC<RNGameProps> = ({
  gameId,
  sessionToken,
  config,
  onComplete,
  onError,
  onEvent,
}) => {
  return React.createElement(GameLauncher, {
    gameId,
    sessionToken,
    config,
    onComplete,
    onError,
    onEvent,
  });
};

const styles = StyleSheet.create({
  centerContainer: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#4b5563',
  },
  errorContainer: {
    padding: 16,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
  },
  listContent: {
    padding: 16,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  cardDescription: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  cardCategory: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4f46e5',
    marginTop: 8,
  },
  launcherCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  launcherHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  launcherTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
  },
  scoreText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#059669',
  },
  stateContainer: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  stateTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 4,
  },
  stateData: {
    fontFamily: 'Courier',
    fontSize: 12,
    color: '#374151',
  },
  buttonRow: {
    flexDirection: 'row',
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#4f46e5',
    paddingVertical: 12,
    marginRight: 6,
    borderRadius: 8,
    alignItems: 'center',
  },
  successButton: {
    flex: 1,
    backgroundColor: '#10b981',
    paddingVertical: 12,
    marginLeft: 6,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  errorCard: {
    backgroundColor: '#fef2f2',
    borderColor: '#fca5a5',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  errorCardTitle: {
    fontWeight: 'bold',
    color: '#dc2626',
    fontSize: 16,
    marginBottom: 4,
  },
  errorCardText: {
    color: '#991b1b',
    fontSize: 14,
  },
});
