import {
  GameAction,
  GameContext,
  GameModule,
  GameResult,
  GameState,
  WordSearchConfig,
  WordSearchEntry,
  WordSearchResult,
} from '@sagegames/types';

export interface CellPosition {
  row: number;
  col: number;
}

export interface PlacedWord {
  entry: WordSearchEntry;
  cells: CellPosition[];
  isFound: boolean;
}

export interface WordSearchStateData {
  categoryName: string;
  grid: string[][];
  size: number;
  placedWords: PlacedWord[];
  foundCount: number;
  totalCount: number;
}

export class WordSearchGameModule
  implements GameModule<WordSearchConfig, GameAction, GameState<WordSearchStateData>, GameResult<WordSearchResult>>
{
  public readonly id = 'game_word_search_001';
  private context?: GameContext<WordSearchConfig>;
  private status: 'idle' | 'running' | 'paused' | 'ended' = 'idle';
  private startTime = 0;
  private score = 0;
  private categoryName = 'General Knowledge';
  private grid: string[][] = [];
  private gridSize = 12;
  private placedWords: PlacedWord[] = [];
  private foundCount = 0;

  public async initialize(context: GameContext<WordSearchConfig>): Promise<void> {
    this.context = context;
    const config = context.config || {};
    this.categoryName = config.categoryName || 'General Knowledge';
    this.gridSize = config.gridSize || (config.difficulty === 'hard' ? 14 : config.difficulty === 'easy' ? 10 : 12);

    const defaultWords: WordSearchEntry[] = [
      { token: 'SAGE', display: 'Sage', definition: 'Wise person or platform' },
      { token: 'GAME', display: 'Game', definition: 'An activity played for entertainment' },
      { token: 'PUZZLE', display: 'Puzzle', definition: 'A game designed to test ingenuity' },
      { token: 'PLATFORM', display: 'Platform', definition: 'A framework for running applications' },
      { token: 'WORD', display: 'Word', definition: 'A single distinct meaningful element of speech' },
      { token: 'SEARCH', display: 'Search', definition: 'To look carefully to find something' },
      { token: 'SOLVER', display: 'Solver', definition: 'An algorithm or component that resolves puzzles' },
      { token: 'RUSH', display: 'Rush', definition: 'To move or act with urgent speed' },
    ];

    let mode = config.wordSelectionMode;
    if (!mode) {
      if (config.includeDefaultWords === false) {
        mode = 'custom_only';
      } else if (config.includeDefaultWords === true && config.words && config.words.length > 0) {
        mode = 'combine';
      } else if (config.words && config.words.length > 0) {
        mode = 'custom_only';
      } else {
        mode = 'default_only';
      }
    }

    let compiledWords: WordSearchEntry[] = [];
    if (mode === 'custom_only') {
      compiledWords = config.words && config.words.length > 0 ? config.words : defaultWords;
    } else if (mode === 'default_only') {
      compiledWords = defaultWords;
    } else {
      // mode === 'combine'
      const customList = config.words || [];
      const map = new Map<string, WordSearchEntry>();
      defaultWords.forEach((w) => map.set(w.token.toUpperCase(), w));
      customList.forEach((w) => map.set(w.token.toUpperCase(), w));
      compiledWords = Array.from(map.values());
    }

    this.generateGrid(compiledWords, config.difficulty || 'medium');

    this.foundCount = 0;
    this.score = 0;
    this.status = 'idle';
  }

  private generateGrid(words: WordSearchEntry[], difficulty: 'easy' | 'medium' | 'hard'): void {
    const size = this.gridSize;
    const grid: string[][] = Array.from({ length: size }, () => Array(size).fill(''));

    // Directions: [dRow, dCol]
    let directions: [number, number][] = [
      [0, 1],  // Right
      [1, 0],  // Down
    ];

    if (difficulty !== 'easy') {
      directions.push([1, 1]);   // Diagonal down-right
      directions.push([-1, 1]);  // Diagonal up-right
    }
    if (difficulty === 'hard') {
      directions.push([0, -1]);  // Left
      directions.push([-1, 0]);  // Up
    }

    const placed: PlacedWord[] = [];

    for (const entry of words) {
      const token = entry.token.toUpperCase().replace(/[^A-Z]/g, '');
      if (token.length < 2 || token.length > size) continue;

      let success = false;
      let attempts = 0;

      while (!success && attempts < 100) {
        attempts++;
        const dir = directions[Math.floor(Math.random() * directions.length)];
        const startRow = Math.floor(Math.random() * size);
        const startCol = Math.floor(Math.random() * size);

        const endRow = startRow + dir[0] * (token.length - 1);
        const endCol = startCol + dir[1] * (token.length - 1);

        if (endRow >= 0 && endRow < size && endCol >= 0 && endCol < size) {
          let fits = true;
          const cells: CellPosition[] = [];

          for (let i = 0; i < token.length; i++) {
            const r = startRow + dir[0] * i;
            const c = startCol + dir[1] * i;
            const existingChar = grid[r][c];

            if (existingChar !== '' && existingChar !== token[i]) {
              fits = false;
              break;
            }
            cells.push({ row: r, col: c });
          }

          if (fits) {
            for (let i = 0; i < token.length; i++) {
              const r = startRow + dir[0] * i;
              const c = startCol + dir[1] * i;
              grid[r][c] = token[i];
            }
            placed.push({ entry, cells, isFound: false });
            success = true;
          }
        }
      }
    }

    // Fill empty cells with random letters A-Z
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (grid[r][c] === '') {
          grid[r][c] = alphabet[Math.floor(Math.random() * alphabet.length)];
        }
      }
    }

    this.grid = grid;
    this.placedWords = placed;
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

    if (action.type === 'FOUND_WORD') {
      const token = String(action.payload).toUpperCase().trim();
      const wordObj = this.placedWords.find(
        (pw) => !pw.isFound && pw.entry.token.toUpperCase() === token
      );

      if (wordObj) {
        wordObj.isFound = true;
        this.foundCount += 1;
        const wordScore = token.length * 100;
        this.score += wordScore;

        this.context?.onEvent({
          type: 'game_score_updated',
          sessionId: this.context.sessionId,
          gameId: this.id,
          timestamp: new Date().toISOString(),
          currentScore: this.score,
          delta: wordScore,
        });

        if (this.foundCount >= this.placedWords.length) {
          this.status = 'ended';
        }
      }
    }
  }

  public getState(): GameState<WordSearchStateData> {
    const elapsedSeconds = this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0;
    return {
      sessionId: this.context?.sessionId || '',
      status: this.status,
      currentScore: this.score,
      elapsedSeconds,
      data: {
        categoryName: this.categoryName,
        grid: this.grid,
        size: this.gridSize,
        placedWords: this.placedWords,
        foundCount: this.foundCount,
        totalCount: this.placedWords.length,
      },
    };
  }

  public async complete(): Promise<GameResult<WordSearchResult>> {
    this.status = 'ended';
    const duration = this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0;
    const totalWords = this.placedWords.length;
    const accuracy = totalWords > 0 ? (this.foundCount / totalWords) * 100 : 0;

    const result: WordSearchResult = {
      wordsFound: this.foundCount,
      totalWords,
      accuracy,
      completedInSeconds: duration,
      categoryName: this.categoryName,
    };

    return {
      sessionId: this.context?.sessionId || '',
      gameId: this.id,
      externalUserId: this.context?.externalUserId || '',
      score: this.score,
      duration,
      completedAt: new Date().toISOString(),
      data: result,
    };
  }

  public async destroy(): Promise<void> {
    this.status = 'ended';
  }
}
