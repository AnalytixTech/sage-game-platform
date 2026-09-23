import { GameState } from '@sagegame/types';
export declare function useGameState<TState extends GameState = GameState>(initialState?: TState): {
    gameState: TState | undefined;
    setGameState: import("react").Dispatch<import("react").SetStateAction<TState | undefined>>;
};
//# sourceMappingURL=useGameState.d.ts.map