/**
 * Online battles (race mode): the match HTTP API and the WebSocket protocol on /v2/ws.
 * Every player gets the same seed and config; moves are applied on the server as they arrive.
 */

export type MatchStatus = 'lobby' | 'countdown' | 'in_progress' | 'finished' | 'cancelled' | 'aborted';
export type MatchPlayerStatus = 'invited' | 'ready' | 'playing' | 'finished' | 'forfeited' | 'absent';

/** POST /v2/matches (host, API key) */
export interface CreateMatchRequest {
  gameId: string;
  /** Players invited up front (e.g. both people in a DM). */
  players: { externalUserId: string; displayName?: string }[];
  /** Let others join while the lobby is open (e.g. group chats), up to maxPlayers. */
  allowJoin?: boolean;
  minPlayers?: number;
  maxPlayers?: number;
  /** How long the lobby stays open before starting with whoever is ready (or cancelling). */
  lobbyTimeoutSec?: number;
  contextId?: string;
  config?: Record<string, unknown>;
}

export interface MatchPlayerView {
  playerId: string;
  externalUserId: string;
  displayName: string | null;
  status: MatchPlayerStatus;
  connected: boolean;
  /** 0..1 */
  progress: number;
  score: number;
  /** Active ms when the player completed the puzzle, if they did. */
  finishedMs: number | null;
}

export interface MatchView {
  matchId: string;
  gameId: string;
  status: MatchStatus;
  contextId: string | null;
  minPlayers: number;
  maxPlayers: number;
  allowJoin: boolean;
  lobbyExpiresAt: string;
  /** Server time (ms since epoch) the race starts / started. */
  startAt: number | null;
  players: MatchPlayerView[];
  standings: MatchStanding[] | null;
}

export interface MatchStanding {
  rank: number;
  playerId: string;
  externalUserId: string;
  displayName: string | null;
  status: MatchPlayerStatus;
  score: number;
  progress: number;
  /** Solved the puzzle (not just ran out of time). */
  completed: boolean;
  finishedMs: number | null;
}

/** POST /v2/matches/:id/tokens and /players (host, API key) */
export interface MatchPlayerToken {
  matchId: string;
  playerId: string;
  /** Session token scoped to this player's seat; send it in the WebSocket auth message. */
  playerToken: string;
}

// ---- WebSocket messages: client → server

export type ClientMessage =
  | { type: 'auth'; token: string }
  | { type: 'ready' }
  | { type: 'action'; seq: number; t: number; a: [type: string, payload?: unknown] }
  | { type: 'forfeit' }
  | { type: 'ping'; t: number };

// ---- WebSocket messages: server → client

export interface WelcomeMessage {
  type: 'welcome';
  you: string;
  match: MatchView;
  play: { gameId: string; rulesVersion: number; seed: string; config: Record<string, unknown> };
  /** Your moves the server already has (after a reconnect), with server-applied times. */
  actions: [t: number, type: string, payload?: unknown][];
  serverNow: number;
}

export type ServerMessage =
  | WelcomeMessage
  | { type: 'match'; match: MatchView; serverNow: number }
  | { type: 'countdown'; startAt: number; serverNow: number }
  | { type: 'started'; startAt: number; serverNow: number }
  | { type: 'ack'; seq: number; t: number }
  | { type: 'reject'; seq: number; code: string }
  | { type: 'progress'; players: Pick<MatchPlayerView, 'playerId' | 'progress' | 'score' | 'status' | 'finishedMs' | 'connected'>[] }
  | { type: 'finished'; standings: MatchStanding[] }
  | { type: 'pong'; t: number; serverNow: number }
  | { type: 'error'; code: string; message: string };
