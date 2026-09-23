import React from 'react';
import { GameEvent, GameResult } from '@sagegame/types';
export interface GameProps {
    gameId: string;
    sessionToken?: string;
    config?: Record<string, unknown>;
    onComplete?: (result: GameResult) => void;
    onError?: (error: Error) => void;
    onEvent?: (event: GameEvent) => void;
    className?: string;
}
export declare const Game: React.FC<GameProps>;
//# sourceMappingURL=Game.d.ts.map