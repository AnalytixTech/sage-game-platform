import {
  GameAction,
  GameContext,
  GameModule,
  GameResult,
  GameState,
  QuizGameResult,
} from '@sagegames/types';

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

export class QuizMasterGameModule
  implements GameModule<QuizConfig, GameAction, GameState<QuizStateData>, GameResult<QuizGameResult>>
{
  public readonly id = 'game_quiz_001';
  private context?: GameContext<QuizConfig>;
  private status: 'idle' | 'running' | 'paused' | 'ended' = 'idle';
  private startTime = 0;
  private currentScore = 0;
  private questions: QuizQuestion[] = [];
  private currentIndex = 0;
  private correctAnswers = 0;
  private userAnswers: number[] = [];
  private questionStartTimes: number[] = [];
  private timePerQuestionMs: number[] = [];

  public async initialize(context: GameContext<QuizConfig>): Promise<void> {
    this.context = context;
    const count = context.config?.questionCount || 5;

    // Generate sample questions
    this.questions = Array.from({ length: count }, (_, i) => ({
      id: `q_${i + 1}`,
      question: `Sample Question ${i + 1}: What is ${i + 1} + ${i + 2}?`,
      options: [`${2 * i + 1}`, `${2 * i + 3}`, `${2 * i + 5}`, `${2 * i + 7}`],
      correctIndex: 1,
    }));

    this.currentIndex = 0;
    this.correctAnswers = 0;
    this.userAnswers = [];
    this.timePerQuestionMs = [];
    this.status = 'idle';
  }

  public async start(): Promise<void> {
    this.status = 'running';
    this.startTime = Date.now();
    this.questionStartTimes[this.currentIndex] = Date.now();
  }

  public async pause(): Promise<void> {
    this.status = 'paused';
  }

  public async resume(): Promise<void> {
    this.status = 'running';
  }

  public async submitAction(action: GameAction): Promise<void> {
    if (this.status !== 'running') return;

    if (action.type === 'ANSWER_QUESTION') {
      const selectedIndex = Number(action.payload);
      this.userAnswers[this.currentIndex] = selectedIndex;

      const qStart = this.questionStartTimes[this.currentIndex] || Date.now();
      const elapsedMs = Date.now() - qStart;
      this.timePerQuestionMs.push(elapsedMs);

      const currentQ = this.questions[this.currentIndex];
      if (currentQ && selectedIndex === currentQ.correctIndex) {
        this.correctAnswers += 1;
        this.currentScore += 100;
        this.context?.onEvent({
          type: 'game_score_updated',
          sessionId: this.context.sessionId,
          gameId: this.id,
          timestamp: new Date().toISOString(),
          currentScore: this.currentScore,
          delta: 100,
        });
      }

      this.currentIndex += 1;

      if (this.currentIndex < this.questions.length) {
        this.questionStartTimes[this.currentIndex] = Date.now();
      } else {
        this.status = 'ended';
      }
    }
  }

  public getState(): GameState<QuizStateData> {
    const elapsedSeconds = this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0;
    return {
      sessionId: this.context?.sessionId || '',
      status: this.status,
      currentScore: this.currentScore,
      elapsedSeconds,
      data: {
        questions: this.questions,
        currentIndex: this.currentIndex,
        correctAnswers: this.correctAnswers,
        userAnswers: this.userAnswers,
        timePerQuestionMs: this.timePerQuestionMs,
      },
    };
  }

  public async complete(): Promise<GameResult<QuizGameResult>> {
    this.status = 'ended';
    const totalQuestions = this.questions.length;
    const accuracy = totalQuestions > 0 ? (this.correctAnswers / totalQuestions) * 100 : 0;
    const duration = this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0;

    const quizResult: QuizGameResult = {
      correctAnswers: this.correctAnswers,
      totalQuestions,
      accuracy,
      timePerQuestionMs: this.timePerQuestionMs,
    };

    return {
      sessionId: this.context?.sessionId || '',
      gameId: this.id,
      externalUserId: this.context?.externalUserId || '',
      score: this.currentScore,
      duration,
      completedAt: new Date().toISOString(),
      data: quizResult,
    };
  }

  public async destroy(): Promise<void> {
    this.status = 'ended';
  }
}
