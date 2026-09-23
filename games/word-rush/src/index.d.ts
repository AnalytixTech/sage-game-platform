import { GameAction, GameContext, GameModule, GameResult, GameState, WordGameResult } from '@sagegame/types';
export interface WordRushConfig {
    gridSize?: number;
    durationSeconds?: number;
}
export interface WordRushStateData {
    foundWords: string[];
    currentInput: string;
    gridLetters: string[];
}
export declare class WordRushGameModule implements GameModule<WordRushConfig, GameAction, GameState<WordRushStateData>, GameResult<WordGameResult>> {
    readonly id = "game_word_001";
    private context?;
    private status;
    private startTime;
    private score;
    private foundWords;
    private longestWord;
    private bonusPoints;
    private invalidAttempts;
    private gridLetters;
    initialize(context: GameContext<WordRushConfig>): Promise<void>;
    start(): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    submitAction(action: GameAction): Promise<void>;
    getState(): GameState<WordRushStateData>;
    complete(): Promise<GameResult<WordGameResult>>;
    destroy(): Promise<void>;
}
//# sourceMappingURL=index.d.ts.map