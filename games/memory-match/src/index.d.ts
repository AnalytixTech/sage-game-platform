import { GameAction, GameContext, GameModule, GameResult, GameState, MemoryGameResult } from '@sagegame/types';
export interface MemoryMatchConfig {
    pairCount?: number;
}
export interface MemoryCard {
    id: number;
    val: string;
    isFlipped: boolean;
    isMatched: boolean;
}
export interface MemoryMatchStateData {
    cards: MemoryCard[];
    moves: number;
    matchedPairs: number;
}
export declare class MemoryMatchGameModule implements GameModule<MemoryMatchConfig, GameAction, GameState<MemoryMatchStateData>, GameResult<MemoryGameResult>> {
    readonly id = "game_memory_001";
    private context?;
    private status;
    private startTime;
    private score;
    private moves;
    private matchedPairs;
    private flawlessMatches;
    private cards;
    private flippedIndices;
    initialize(context: GameContext<MemoryMatchConfig>): Promise<void>;
    start(): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    submitAction(action: GameAction): Promise<void>;
    getState(): GameState<MemoryMatchStateData>;
    complete(): Promise<GameResult<MemoryGameResult>>;
    destroy(): Promise<void>;
}
//# sourceMappingURL=index.d.ts.map