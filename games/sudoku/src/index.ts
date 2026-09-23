import {
  GameAction,
  GameContext,
  GameModule,
  GameResult,
  GameState,
  SudokuConfig,
  SudokuResult,
  SudokuVariantId,
} from '@sagegame/types';

export interface VariantConfig {
  id: SudokuVariantId;
  name: string;
  size: number;
  boxWidth: number;
  boxHeight: number;
  isIrregular?: boolean;
  regionMap?: number[][];
}

export const VARIANT_CONFIGS: Record<SudokuVariantId, VariantConfig> = {
  '4x4': { id: '4x4', name: '4x4 Mini', size: 4, boxWidth: 2, boxHeight: 2 },
  '4x4_irregular': {
    id: '4x4_irregular',
    name: '4x4 Irregular',
    size: 4,
    boxWidth: 2,
    boxHeight: 2,
    isIrregular: true,
    regionMap: [
      [0, 0, 0, 1],
      [0, 2, 1, 1],
      [2, 2, 1, 3],
      [2, 3, 3, 3],
    ],
  },
  '5x5_irregular': {
    id: '5x5_irregular',
    name: '5x5 Irregular',
    size: 5,
    boxWidth: 5,
    boxHeight: 1,
    isIrregular: true,
    regionMap: [
      [0, 1, 1, 2, 2],
      [0, 0, 1, 2, 2],
      [0, 0, 1, 1, 2],
      [3, 3, 3, 4, 4],
      [3, 3, 4, 4, 4],
    ],
  },
  '6x6': { id: '6x6', name: '6x6 Standard', size: 6, boxWidth: 3, boxHeight: 2 },
  '6x6_irregular': {
    id: '6x6_irregular',
    name: '6x6 Irregular',
    size: 6,
    boxWidth: 3,
    boxHeight: 2,
    isIrregular: true,
    regionMap: [
      [0, 0, 0, 1, 1, 1],
      [0, 0, 2, 2, 1, 1],
      [0, 2, 2, 3, 3, 1],
      [4, 2, 2, 3, 3, 5],
      [4, 4, 3, 3, 5, 5],
      [4, 4, 4, 5, 5, 5],
    ],
  },
  '7x7_irregular': {
    id: '7x7_irregular',
    name: '7x7 Irregular',
    size: 7,
    boxWidth: 7,
    boxHeight: 1,
    isIrregular: true,
    regionMap: [
      [0, 0, 0, 1, 1, 1, 1],
      [0, 0, 0, 0, 1, 1, 1],
      [2, 2, 2, 3, 3, 4, 4],
      [2, 2, 2, 3, 4, 4, 4],
      [2, 5, 3, 3, 3, 3, 4],
      [5, 5, 6, 6, 6, 6, 4],
      [5, 5, 5, 5, 6, 6, 6],
    ],
  },
  '8x8': { id: '8x8', name: '8x8 Standard', size: 8, boxWidth: 4, boxHeight: 2 },
  '8x8_irregular': {
    id: '8x8_irregular',
    name: '8x8 Irregular',
    size: 8,
    boxWidth: 4,
    boxHeight: 2,
    isIrregular: true,
    regionMap: [
      [0, 0, 0, 0, 0, 1, 1, 1],
      [0, 0, 0, 2, 1, 1, 1, 1],
      [2, 2, 2, 2, 2, 3, 3, 1],
      [2, 2, 4, 4, 3, 3, 3, 3],
      [4, 4, 4, 4, 3, 3, 5, 5],
      [6, 4, 4, 5, 5, 5, 5, 5],
      [6, 6, 6, 6, 7, 7, 7, 5],
      [6, 6, 6, 7, 7, 7, 7, 7],
    ],
  },
  '9x9': { id: '9x9', name: '9x9 Classic', size: 9, boxWidth: 3, boxHeight: 3 },
};

export interface SudokuCell {
  row: number;
  col: number;
  value: number; // 0 = empty
  solution: number;
  regionId: number;
  isInitial: boolean;
  isConflict: boolean;
  notes: number[];
}

export interface SudokuStateData {
  variant: SudokuVariantId;
  variantName: string;
  size: number;
  board: SudokuCell[][];
  difficulty: 'easy' | 'medium' | 'hard';
  movesCount: number;
  mistakesCount: number;
  hintsUsed: number;
  isComplete: boolean;
}

export class SudokuGameModule
  implements GameModule<SudokuConfig, GameAction, GameState<SudokuStateData>, GameResult<SudokuResult>>
{
  public readonly id = 'game_sudoku_001';
  private context?: GameContext<SudokuConfig>;
  private status: 'idle' | 'running' | 'paused' | 'ended' = 'idle';
  private startTime = 0;
  private score = 0;
  private variantId: SudokuVariantId = '9x9';
  private variantConfig: VariantConfig = VARIANT_CONFIGS['9x9'];
  private difficulty: 'easy' | 'medium' | 'hard' = 'medium';
  private board: SudokuCell[][] = [];
  private movesCount = 0;
  private mistakesCount = 0;
  private hintsUsed = 0;

  public async initialize(context: GameContext<SudokuConfig>): Promise<void> {
    this.context = context;
    this.variantId = context.config?.variant || '9x9';
    this.variantConfig = VARIANT_CONFIGS[this.variantId] || VARIANT_CONFIGS['9x9'];
    this.difficulty = context.config?.difficulty || 'medium';

    this.generateBoard();

    this.movesCount = 0;
    this.mistakesCount = 0;
    this.hintsUsed = 0;
    this.score = 1000;
    this.status = 'idle';
  }

  private getRegionId(r: number, c: number, config: VariantConfig): number {
    if (config.isIrregular && config.regionMap) {
      return config.regionMap[r][c];
    }
    const boxRow = Math.floor(r / config.boxHeight);
    const boxCol = Math.floor(c / config.boxWidth);
    const boxesPerRow = config.size / config.boxWidth;
    return boxRow * boxesPerRow + boxCol;
  }

  private isValidPlacement(
    grid: number[][],
    r: number,
    c: number,
    val: number,
    config: VariantConfig
  ): boolean {
    const N = config.size;
    const targetRegion = this.getRegionId(r, c, config);

    for (let i = 0; i < N; i++) {
      if (grid[r][i] === val) return false;
      if (grid[i][c] === val) return false;
    }

    for (let row = 0; row < N; row++) {
      for (let col = 0; col < N; col++) {
        if (this.getRegionId(row, col, config) === targetRegion && grid[row][col] === val) {
          return false;
        }
      }
    }

    return true;
  }

  private solveBacktracking(grid: number[][], config: VariantConfig): boolean {
    const N = config.size;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (grid[r][c] === 0) {
          // Try numbers 1..N in random order
          const nums = Array.from({ length: N }, (_, i) => i + 1).sort(() => Math.random() - 0.5);
          for (const val of nums) {
            if (this.isValidPlacement(grid, r, c, val, config)) {
              grid[r][c] = val;
              if (this.solveBacktracking(grid, config)) {
                return true;
              }
              grid[r][c] = 0;
            }
          }
          return false;
        }
      }
    }
    return true;
  }

  private generateBoard(): void {
    const config = this.variantConfig;
    const N = config.size;
    const solutionGrid: number[][] = Array.from({ length: N }, () => Array(N).fill(0));

    // Solve to generate full valid solution grid
    this.solveBacktracking(solutionGrid, config);

    // Calculate how many givens to keep based on difficulty
    const totalCells = N * N;
    let keepRatio = this.difficulty === 'easy' ? 0.55 : this.difficulty === 'medium' ? 0.42 : 0.32;
    let filledCount = Math.floor(totalCells * keepRatio);

    const initialBoard: SudokuCell[][] = [];
    for (let r = 0; r < N; r++) {
      const row: SudokuCell[] = [];
      for (let c = 0; c < N; c++) {
        row.push({
          row: r,
          col: c,
          value: 0,
          solution: solutionGrid[r][c],
          regionId: this.getRegionId(r, c, config),
          isInitial: false,
          isConflict: false,
          notes: [],
        });
      }
      initialBoard.push(row);
    }

    let kept = 0;
    while (kept < filledCount) {
      const r = Math.floor(Math.random() * N);
      const c = Math.floor(Math.random() * N);
      if (!initialBoard[r][c].isInitial) {
        initialBoard[r][c].isInitial = true;
        initialBoard[r][c].value = solutionGrid[r][c];
        kept++;
      }
    }

    this.board = initialBoard;
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

    if (action.type === 'ENTER_NUMBER') {
      const { row, col, value } = action.payload as { row: number; col: number; value: number };
      const cell = this.board[row]?.[col];

      if (!cell || cell.isInitial) return;

      this.movesCount++;
      cell.value = value;
      cell.notes = [];

      if (value !== 0 && value !== cell.solution) {
        cell.isConflict = true;
        this.mistakesCount++;
        this.score = Math.max(0, this.score - 50);
      } else {
        cell.isConflict = false;
        this.score += 25;
      }

      this.context?.onEvent({
        type: 'game_score_updated',
        sessionId: this.context.sessionId,
        gameId: this.id,
        timestamp: new Date().toISOString(),
        currentScore: this.score,
        delta: value === cell.solution ? 25 : -50,
      });

      this.checkCompletion();
    } else if (action.type === 'TOGGLE_NOTE') {
      const { row, col, note } = action.payload as { row: number; col: number; note: number };
      const cell = this.board[row]?.[col];
      if (cell && !cell.isInitial && cell.value === 0) {
        if (cell.notes.includes(note)) {
          cell.notes = cell.notes.filter((n) => n !== note);
        } else {
          cell.notes.push(note);
          cell.notes.sort((a, b) => a - b);
        }
      }
    } else if (action.type === 'USE_HINT') {
      const { row, col } = (action.payload as { row: number; col: number }) || {};
      let targetCell = this.board[row]?.[col];

      if (!targetCell || targetCell.isInitial || targetCell.value === targetCell.solution) {
        // Find first unsolved cell
        for (let r = 0; r < this.variantConfig.size; r++) {
          for (let c = 0; c < this.variantConfig.size; c++) {
            if (!this.board[r][c].isInitial && this.board[r][c].value !== this.board[r][c].solution) {
              targetCell = this.board[r][c];
              break;
            }
          }
          if (targetCell && targetCell.value !== targetCell.solution) break;
        }
      }

      if (targetCell) {
        targetCell.value = targetCell.solution;
        targetCell.isConflict = false;
        this.hintsUsed++;
        this.score = Math.max(0, this.score - 100);
        this.checkCompletion();
      }
    } else if (action.type === 'ERASE_CELL') {
      const { row, col } = action.payload as { row: number; col: number };
      const cell = this.board[row]?.[col];
      if (cell && !cell.isInitial) {
        cell.value = 0;
        cell.isConflict = false;
        cell.notes = [];
      }
    }
  }

  private checkCompletion(): void {
    const N = this.variantConfig.size;
    let complete = true;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (this.board[r][c].value !== this.board[r][c].solution) {
          complete = false;
          break;
        }
      }
    }

    if (complete) {
      this.status = 'ended';
    }
  }

  public getState(): GameState<SudokuStateData> {
    const elapsedSeconds = this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0;
    const N = this.variantConfig.size;
    let isComplete = true;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (this.board[r][c].value !== this.board[r][c].solution) {
          isComplete = false;
          break;
        }
      }
    }

    return {
      sessionId: this.context?.sessionId || '',
      status: this.status,
      currentScore: this.score,
      elapsedSeconds,
      data: {
        variant: this.variantId,
        variantName: this.variantConfig.name,
        size: N,
        board: this.board,
        difficulty: this.difficulty,
        movesCount: this.movesCount,
        mistakesCount: this.mistakesCount,
        hintsUsed: this.hintsUsed,
        isComplete,
      },
    };
  }

  public async complete(): Promise<GameResult<SudokuResult>> {
    this.status = 'ended';
    const duration = this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0;

    const result: SudokuResult = {
      variant: this.variantId,
      movesCount: this.movesCount,
      mistakesCount: this.mistakesCount,
      hintsUsed: this.hintsUsed,
      completedInSeconds: duration,
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
