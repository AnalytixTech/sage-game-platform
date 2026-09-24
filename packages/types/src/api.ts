/**
 * v2 API response shapes shared by the SDK and the platform API.
 */

/** Credentials a host backend hands to its app for one game. */
export interface SessionCredentials {
  sessionId: string;
  sessionToken: string;
}

/** POST /v2/sessions (host) */
export interface CreateSessionV2Request {
  gameId: string;
  externalUserId: string;
  displayName?: string;
  /** Host-defined grouping for leaderboards, e.g. "dm:123" or "group:42". */
  contextId?: string;
  config?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface CreateSessionV2Response extends SessionCredentials {
  gameId: string;
  expiresAt: string;
  rulesVersion: number;
}

/** GET /v2/sessions/:id/play: everything the SDK needs to build the game locally. */
export interface PlayInfo {
  sessionId: string;
  gameId: string;
  rulesVersion: number;
  seed: string;
  config: Record<string, unknown>;
  status: 'created' | 'active' | 'paused' | 'completed' | 'expired';
  displayName: string | null;
  contextId: string | null;
  expiresAt: string;
  startedAt: string | null;
  serverNow: string;
}

/** POST /v2/sessions/:id/complete: the server's verdict after replaying the action log. */
export interface CompletionResult<TResult = Record<string, unknown>> {
  sessionId: string;
  gameId: string;
  /** 'rejected' means the log could not have come from an honest client. */
  status: 'verified' | 'rejected';
  /** Counts on leaderboards (verified, no plausibility flags, not a test key). */
  valid: boolean;
  score: number;
  durationMs: number;
  result: TResult;
  flags: string[];
  rejectCode: string | null;
  /** All-time rank in the session's context (or game) when valid. */
  rank: number | null;
  completedAt: string;
}

export interface ApiErrorBody {
  error: string;
  code?: string;
  details?: unknown;
}
