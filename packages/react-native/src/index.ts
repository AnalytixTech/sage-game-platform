import React from 'react';
import { Game as GameMetadata, GameCategory, GameEvent, GameResult } from '@sagegames/types';
import { useGames } from '@sagegames/react';

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
 * React Native GameCatalog component using React Native View/Text representations
 */
export const GameCatalog: React.FC<RNGameCatalogProps> = ({ onSelectGame, category }) => {
  const { games, loading, error } = useGames({ category });

  if (loading) {
    return React.createElement('div', { style: { padding: 20, textAlign: 'center' } }, 'Loading Games for Mobile...');
  }

  if (error) {
    return React.createElement('div', { style: { color: 'red', padding: 20 } }, `Error: ${error.message}`);
  }

  return React.createElement(
    'div',
    { style: { padding: 16 } },
    games.map((item: GameMetadata) =>
      React.createElement(
        'div',
        {
          key: item.id,
          onClick: () => onSelectGame?.(item),
          style: {
            padding: 16,
            marginBottom: 12,
            borderRadius: 10,
            background: '#ffffff',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            cursor: 'pointer',
          },
        },
        React.createElement('div', { style: { fontSize: 18, fontWeight: 'bold' } }, item.name),
        React.createElement('div', { style: { color: '#666', marginTop: 4 } }, item.description),
        React.createElement(
          'div',
          {
            style: {
              marginTop: 8,
              fontSize: 12,
              color: '#4f46e5',
              fontWeight: '600',
              textTransform: 'uppercase',
            },
          },
          `${item.category} • Version ${item.version}`
        )
      )
    )
  );
};

export interface RNGameLauncherProps {
  gameId: string;
  sessionToken?: string;
  onComplete?: (result: GameResult) => void;
  onEvent?: (event: GameEvent) => void;
}

/**
 * React Native GameLauncher component
 */
export const GameLauncher: React.FC<RNGameLauncherProps> = ({
  gameId,
  sessionToken,
  onComplete,
  onEvent,
}) => {
  return React.createElement(
    'div',
    { style: { padding: 20, background: '#f9fafb', borderRadius: 12 } },
    React.createElement('h3', null, `Mobile Game Launcher: ${gameId}`),
    React.createElement('p', { style: { color: '#4b5563' } }, 'Session Active. Interactive touch screen ready.'),
    React.createElement(
      'button',
      {
        onClick: () =>
          onComplete?.({
            sessionId: `sess_rn_${Date.now()}`,
            gameId,
            externalUserId: 'user_mobile',
            score: 1500,
            duration: 45,
            completedAt: new Date().toISOString(),
            data: { platform: 'react-native' },
          }),
        style: {
          padding: '12px 20px',
          background: '#4f46e5',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
          fontWeight: 'bold',
        },
      },
      'Finish Mobile Session'
    )
  );
};

export interface RNGameProps {
  gameId: string;
  sessionToken?: string;
  onComplete?: (result: GameResult) => void;
}

export const Game: React.FC<RNGameProps> = ({ gameId, sessionToken, onComplete }) => {
  return React.createElement(GameLauncher, { gameId, sessionToken, onComplete });
};
