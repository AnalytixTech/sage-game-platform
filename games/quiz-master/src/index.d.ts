import { GameAction, GameContext, GameModule, GameResult, GameState, QuizGameResult } from '@sagegame/types';
export interface QuizConfig {
    questionCount?: number;
    timeLimitSeconds?: number;
    difficulty?: 'easy' | 'medium' | 'hard';
}
export interface QuizQuestion {
    id: string;
    question: string;
    options: string[];
    correctIndex: number;
}
export interface QuizStateData {
    questions: QuizQuestion[];
    currentIndex: number;
    correctAnswers: number;
    userAnswers: number[];
    timePerQuestionMs: number[];
}
export declare class QuizMasterGameModule implements GameModule<QuizConfig, GameAction, GameState<QuizStateData>, GameResult<QuizGameResult>> {
    readonly id = "game_quiz_001";
    private context?;
    private status;
    private startTime;
    private currentScore;
    private questions;
    private currentIndex;
    private correctAnswers;
    private userAnswers;
    private questionStartTimes;
    private timePerQuestionMs;
    initialize(context: GameContext<QuizConfig>): Promise<void>;
    start(): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    submitAction(action: GameAction): Promise<void>;
    getState(): GameState<QuizStateData>;
    complete(): Promise<GameResult<QuizGameResult>>;
    destroy(): Promise<void>;
}
//# sourceMappingURL=index.d.ts.map