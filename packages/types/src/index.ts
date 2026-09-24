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
  /** Configured words that could not be placed on the grid (too long or no space). */
  skippedWords?: string[];
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
  /** True when the puzzle was fully solved (not timed out or quit). */
  solved?: boolean;
}

/**
 * Leaderboard Specs
 */
export type LeaderboardPeriod = 'all_time' | 'daily' | 'weekly' | 'monthly';
export type LeaderboardScope = 'global' | 'tenant' | 'game';

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
  contextId?: string;
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
 * Webhooks: POSTed to the tenant's webhook URL with a Sage-Signature header
 * (t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>" keyed with the webhook secret>).
 */
export type WebhookEventType = 'session.completed' | 'match.finished';

export interface WebhookEnvelope<TData = unknown> {
  id: string;
  type: WebhookEventType;
  tenantId: string;
  createdAt: string;
  data: TData;
}

export interface SessionCompletedData {
  sessionId: string;
  gameId: string;
  externalUserId: string;
  displayName: string | null;
  contextId: string | null;
  status: 'verified' | 'rejected';
  valid: boolean;
  score: number;
  durationMs: number;
  result: Record<string, unknown>;
  flags: string[];
  rejectCode: string | null;
  completedAt: string;
}

export * from './rules';
export * from './api';
