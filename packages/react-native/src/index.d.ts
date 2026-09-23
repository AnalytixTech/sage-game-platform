import React from 'react';
import { Game, GameCategory, GameEvent, GameResult } from '@sagegame/types';
export { SageGameProvider, useSageGameContext, useGames, useGame, useGameSession, useGameState, useGameResult, } from '@sagegame/react';
export interface RNGameCatalogProps {
    onSelectGame?: (game: Game) => void;
    category?: GameCategory;
}
/**
 * React Native GameCatalog component using React Native View/Text representations
 */
export declare const GameCatalog: React.FC<RNGameCatalogProps>;
export interface RNGameLauncherProps {
    gameId: string;
    sessionToken?: string;
    onComplete?: (result: GameResult) => void;
    onEvent?: (event: GameEvent) => void;
}
/**
 * React Native GameLauncher component
 */
export declare const GameLauncher: React.FC<RNGameLauncherProps>;
export interface RNGameProps {
    gameId: string;
    sessionToken?: string;
    onComplete?: (result: GameResult) => void;
}
export declare const Game: React.FC<RNGameProps>;
//# sourceMappingURL=index.d.ts.map