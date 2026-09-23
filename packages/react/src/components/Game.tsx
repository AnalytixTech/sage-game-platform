import React from 'react';
import { GameEvent, GameResult } from '@sagegames/types';
import { GameLauncher } from './GameLauncher';

export interface GameProps {
  gameId: string;
  sessionToken?: string;
  config?: Record<string, unknown>;
  onComplete?: (result: GameResult<any>) => void;
  onError?: (error: Error) => void;
  onEvent?: (event: GameEvent) => void;
  className?: string;
}

export const Game: React.FC<GameProps> = ({
  gameId,
  sessionToken,
  config,
  onComplete,
  onError,
  onEvent,
  className,
}) => {
  return (
    <div className={className}>
      <GameLauncher
        gameId={gameId}
        sessionToken={sessionToken}
        config={config}
        onComplete={onComplete}
        onError={onError}
        onEvent={onEvent}
      />
    </div>
  );
};
