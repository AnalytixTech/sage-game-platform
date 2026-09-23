export type Platform = 'web' | 'ios' | 'android';

export type GameCategory =
  | 'quiz'
  | 'trivia'
  | 'word'
  | 'puzzle'
  | 'memory'
  | 'multiplayer'
  | 'arcade'
  | 'strategy';

export type GameStatus = 'draft' | 'published' | 'deprecated' | 'maintenance';

export type GameDeliveryModel = 'sdk_rendered' | 'remote_embedded';

/**
 * Game Metadata definition registered in SageGame Platform Catalog
 */
export interface Game<TConfig = Record<string, unknown>> {
  id: string;
  slug: string;
  name: string;
  description?: string;
  version: string;
  category: GameCategory;
  status: GameStatus;
  deliveryModel: GameDeliveryModel;
  remoteUrl?: string;
  thumbnail?: string;
  icon?: string;
  supportedPlatforms: Platform[];
  configuration?: TConfig;
}

/**
 * Tenant Game Access configuration specifying authorized games per tenant
 */
export interface TenantGameAccess {
  tenantId: string;
  gameId: string;
  isEnabled: boolean;
  allowedConfigurations?: Record<string, unknown>;
}

export type GameSessionStatus =
  | 'created'
  | 'active'
  | 'paused'
  | 'completed'
  | 'expired'
  | 'terminated';

/**
 * Game Session Entity linking Tenant -> ExternalUser -> Game -> Session
 */
export interface GameSession {
  id: string;
  tenantId: string;
  externalUserId: string;
  gameId: string;
  status: GameSessionStatus;
  startedAt?: string;
  completedAt?: string;
  expiresAt: string;
  sessionToken?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Host Application Request to create a game session (Backend-to-Backend)
 */
export interface CreateSessionRequest {
  gameId: string;
  externalUserId: string;
  metadata?: Record<string, unknown>;
  configOverride?: Record<string, unknown>;
}

/**
 * Response returned to Host Backend after creating session
 */
export interface CreateSessionResponse {
  sessionId: string;
  sessionToken: string;
  gameId: string;
  expiresAt: string;
}

/**
 * Standard Game Action wrapper
 */
export interface GameAction<TType extends string = string, TPayload = unknown> {
  type: TType;
  payload: TPayload;
  timestamp: number;
}

/**
 * Standard Game State representation
 */
export interface GameState<TData = unknown> {
  sessionId: string;
  status: 'idle' | 'running' | 'paused' | 'ended';
  currentScore: number;
  elapsedSeconds: number;
  data: TData;
}

/**
 * Generic Game Result payload returned upon game completion
 */
export interface GameResult<TDetails = Record<string, unknown>> {
  sessionId: string;
  gameId: string;
  externalUserId: string;
  score: number;
  duration: number;
  completedAt: string;
  data: TDetails;
}

/**
 * Game-Specific Result Types
 */
export interface QuizGameResult {
  correctAnswers: number;
  totalQuestions: number;
  accuracy: number;
  timePerQuestionMs: number[];
}

export interface WordGameResult {
  wordsFound: number;
  longestWord: string;
  bonusPoints: number;
  invalidAttempts: number;
}

export interface MemoryGameResult {
  totalMoves: number;
  matchedPairs: number;
  flawlessMatches: number;
}

export interface WordSearchEntry {
  token: string;
  display: string;
  definition?: string;
  note?: string;
}

export type WordSelectionMode = 'custom_only' | 'default_only' | 'combine';

export interface WordSearchConfig {
  categoryName?: string;
  words?: WordSearchEntry[];
  includeDefaultWords?: boolean;
  wordSelectionMode?: WordSelectionMode;
  gridSize?: number;
  difficulty?: 'easy' | 'medium' | 'hard';
}

export interface WordSearchResult {
  wordsFound: number;
  totalWords: number;
  accuracy: number;
  completedInSeconds: number;
  categoryName: string;
}

export type SudokuVariantId =
  | '4x4'
  | '4x4_irregular'
  | '5x5_irregular'
  | '6x6'
  | '6x6_irregular'
  | '7x7_irregular'
  | '8x8'
  | '8x8_irregular'
  | '9x9';

export interface SudokuConfig {
  variant?: SudokuVariantId;
  difficulty?: 'easy' | 'medium' | 'hard';
  timeLimitSeconds?: number;
}

export interface SudokuResult {
  variant: SudokuVariantId;
  movesCount: number;
  mistakesCount: number;
  hintsUsed: number;
  completedInSeconds: number;
}

/**
 * Standard Platform Events
 */
export type GameEventType =
  | 'game_started'
  | 'game_paused'
  | 'game_resumed'
  | 'game_progress'
  | 'game_score_updated'
  | 'game_completed'
  | 'game_error'
  | 'custom';

export interface BaseGameEvent {
  type: GameEventType;
  sessionId: string;
  gameId: string;
  timestamp: string;
}

export interface GameStartedEvent extends BaseGameEvent {
  type: 'game_started';
}

export interface GamePausedEvent extends BaseGameEvent {
  type: 'game_paused';
}

export interface GameResumedEvent extends BaseGameEvent {
  type: 'game_resumed';
}

export interface GameProgressEvent<TState = unknown> extends BaseGameEvent {
  type: 'game_progress';
  progressPercentage: number;
  stateSnapshot?: TState;
}

export interface GameScoreUpdatedEvent extends BaseGameEvent {
  type: 'game_score_updated';
  currentScore: number;
  delta: number;
}

export interface GameCompletedEvent<TResult = unknown> extends BaseGameEvent {
  type: 'game_completed';
  result: GameResult<TResult>;
}

export interface GameErrorEvent extends BaseGameEvent {
  type: 'game_error';
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface CustomGameEvent<TPayload = unknown> extends BaseGameEvent {
  type: 'custom';
  customType: string;
  payload: TPayload;
}

export type GameEventMap = {
  game_started: GameStartedEvent;
  game_paused: GamePausedEvent;
  game_resumed: GameResumedEvent;
  game_progress: GameProgressEvent;
  game_score_updated: GameScoreUpdatedEvent;
  game_completed: GameCompletedEvent;
  game_error: GameErrorEvent;
  custom: CustomGameEvent;
};

export type GameEvent = GameEventMap[keyof GameEventMap];

/**
 * Lifecycle Context passed into Game Modules
 */
export interface GameContext<TConfig = Record<string, unknown>> {
  sessionId: string;
  gameId: string;
  externalUserId: string;
  platform: Platform;
  config: TConfig;
  sessionToken: string;
  onEvent: (event: GameEvent) => void;
}

/**
 * Platform Contract for every Game Module
 */
export interface GameModule<
  TConfig = Record<string, unknown>,
  TAction = GameAction,
  TState = GameState,
  TResult = GameResult
> {
  id: string;
  initialize(context: GameContext<TConfig>): Promise<void>;
  start(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  submitAction(action: TAction): Promise<void>;
  getState(): TState;
  complete(): Promise<TResult>;
  destroy(): Promise<void>;
}

/**
 * Leaderboard Specs
 */
export type LeaderboardPeriod = 'all_time' | 'daily' | 'weekly' | 'monthly';
export type LeaderboardScope = 'global' | 'tenant' | 'game';

export interface LeaderboardQuery {
  gameId?: string;
  tenantId?: string;
  period?: LeaderboardPeriod;
  scope?: LeaderboardScope;
  limit?: number;
  offset?: number;
}

export interface LeaderboardEntry {
  rank: number;
  externalUserId: string;
  username?: string;
  score: number;
  achievedAt: string;
  gameId: string;
}

export interface Leaderboard {
  gameId?: string;
  period: LeaderboardPeriod;
  entries: LeaderboardEntry[];
  totalPlayers: number;
}

/**
 * Player Statistics
 */
export interface GamePlayerStats {
  gameId: string;
  gamesPlayed: number;
  gamesCompleted: number;
  totalScore: number;
  highestScore: number;
  averageScore: number;
  totalPlayTimeSeconds: number;
}

export interface PlayerStats {
  externalUserId: string;
  gamesPlayed: number;
  gamesCompleted: number;
  totalScore: number;
  averageScore: number;
  perGameStats: Record<string, GamePlayerStats>;
}

/**
 * Webhooks
 */
export type WebhookEventType =
  | 'game.session.created'
  | 'game.session.started'
  | 'game.session.completed'
  | 'game.result.created'
  | 'game.session.expired';

export interface WebhookPayload<TPayload = unknown> {
  id: string;
  event: WebhookEventType;
  tenantId: string;
  externalUserId: string;
  gameId: string;
  sessionId: string;
  timestamp: string;
  payload: TPayload;
  signature: string;
}
