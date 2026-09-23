import {
  GameAction,
  GameContext,
  GameModule,
  GameResult,
  GameState,
  WordGameResult,
} from '@sagegame/types';

export interface WordRushConfig {
  gridSize?: number;
  durationSeconds?: number;
}

export interface WordRushStateData {
  foundWords: string[];
  currentInput: string;
  gridLetters: string[];
}

export class WordRushGameModule
  implements GameModule<WordRushConfig, GameAction, GameState<WordRushStateData>, GameResult<WordGameResult>>
{
  public readonly id = 'game_word_001';
  private context?: GameContext<WordRushConfig>;
  private status: 'idle' | 'running' | 'paused' | 'ended' = 'idle';
  private startTime = 0;
  private score = 0;
  private foundWords: string[] = [];
  private longestWord = '';
  private bonusPoints = 0;
  private invalidAttempts = 0;
  private gridLetters: string[] = ['S', 'A', 'G', 'E', 'G', 'A', 'M', 'E', 'R', 'U', 'S', 'H', 'W', 'O', 'R', 'D'];

  public async initialize(context: GameContext<WordRushConfig>): Promise<void> {
    this.context = context;
    this.foundWords = [];
    this.longestWord = '';
    this.score = 0;
    this.bonusPoints = 0;
    this.invalidAttempts = 0;
    this.status = 'idle';
  }

  public async start(): Promise<void> {
    this.status = 'running';
    this.startTime = Date.now();
  }

  public async pause(): Promise<void> {
    this.status = 'paused';
  }

  public async resume(): Promise<void> {
    this.status = 'running';
  }

  public async submitAction(action: GameAction): Promise<void> {
    if (this.status !== 'running') return;

    if (action.type === 'SUBMIT_WORD') {
      const word = String(action.payload).toUpperCase().trim();
      if (word.length >= 3 && !this.foundWords.includes(word)) {
        this.foundWords.push(word);
        const wordScore = word.length * 50;
        this.score += wordScore;

        if (word.length > this.longestWord.length) {
          this.longestWord = word;
          this.bonusPoints += 100;
          this.score += 100;
        }

        this.context?.onEvent({
          type: 'game_score_updated',
          sessionId: this.context.sessionId,
          gameId: this.id,
          timestamp: new Date().toISOString(),
          currentScore: this.score,
          delta: wordScore,
        });
      } else {
        this.invalidAttempts += 1;
      }
    }
  }

  public getState(): GameState<WordRushStateData> {
    const elapsedSeconds = this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0;
    return {
      sessionId: this.context?.sessionId || '',
      status: this.status,
      currentScore: this.score,
      elapsedSeconds,
      data: {
        foundWords: this.foundWords,
        currentInput: '',
        gridLetters: this.gridLetters,
      },
    };
  }

  public async complete(): Promise<GameResult<WordGameResult>> {
    this.status = 'ended';
    const duration = this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0;

    const wordResult: WordGameResult = {
      wordsFound: this.foundWords.length,
      longestWord: this.longestWord,
      bonusPoints: this.bonusPoints,
      invalidAttempts: this.invalidAttempts,
    };

    return {
      sessionId: this.context?.sessionId || '',
      gameId: this.id,
      externalUserId: this.context?.externalUserId || '',
      score: this.score,
      duration,
      completedAt: new Date().toISOString(),
      data: wordResult,
    };
  }

  public async destroy(): Promise<void> {
    this.status = 'ended';
  }
}
