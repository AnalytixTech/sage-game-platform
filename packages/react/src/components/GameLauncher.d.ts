import React from 'react';
import { GameEvent, GameResult } from '@sagegame/types';
export interface GameLauncherProps {
    gameId: string;
    sessionToken?: string;
    config?: Record<string, unknown>;
    onComplete?: (result: GameResult) => void;
    onError?: (error: Error) => void;
    onEvent?: (event: GameEvent) => void;
}
export declare const GameLauncher: React.FC<GameLauncherProps>;
//# sourceMappingURL=GameLauncher.d.ts.map