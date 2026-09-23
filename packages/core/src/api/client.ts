import {
  Game,
  GameCategory,
  GameResult,
  GameSession,
  Leaderboard,
  LeaderboardQuery,
  PlayerStats,
} from '@sagegames/types';

export interface SageGameClientOptions {
  baseUrl?: string;
  sessionToken?: string;
}

export interface GameListFilter {
  category?: GameCategory;
  search?: string;
}

export class SageGameClient {
  private baseUrl: string;
  private sessionToken?: string;

  constructor(options: SageGameClientOptions = {}) {
    this.baseUrl = options.baseUrl || 'https://api.sagegame.com';
    this.sessionToken = options.sessionToken;
  }

  public setSessionToken(token: string): void {
    this.sessionToken = token;
  }

  public getSessionToken(): string | undefined {
    return this.sessionToken;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.sessionToken) {
      headers['Authorization'] = `Bearer ${this.sessionToken}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SageGame API Error (${response.status}): ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  public games = {
    list: async (filter?: GameListFilter): Promise<Game[]> => {
      const params = new URLSearchParams();
      if (filter?.category) params.append('category', filter.category);
      if (filter?.search) params.append('search', filter.search);
      const queryStr = params.toString() ? `?${params.toString()}` : '';
      return this.request<Game[]>(`/v1/games${queryStr}`);
    },

    get: async (gameId: string): Promise<Game> => {
      return this.request<Game>(`/v1/games/${encodeURIComponent(gameId)}`);
    },
  };

  public sessions = {
    get: async (sessionId: string): Promise<GameSession> => {
      return this.request<GameSession>(`/v1/sessions/${encodeURIComponent(sessionId)}`);
    },

    start: async (sessionId: string): Promise<GameSession> => {
      return this.request<GameSession>(`/v1/sessions/${encodeURIComponent(sessionId)}/start`, {
        method: 'POST',
      });
    },

    pause: async (sessionId: string): Promise<GameSession> => {
      return this.request<GameSession>(`/v1/sessions/${encodeURIComponent(sessionId)}/pause`, {
        method: 'POST',
      });
    },

    resume: async (sessionId: string): Promise<GameSession> => {
      return this.request<GameSession>(`/v1/sessions/${encodeURIComponent(sessionId)}/resume`, {
        method: 'POST',
      });
    },

    complete: async <T = Record<string, unknown>>(
      sessionId: string,
      resultData: { score: number; duration: number; data?: T }
    ): Promise<GameResult<T>> => {
      return this.request<GameResult<T>>(
        `/v1/sessions/${encodeURIComponent(sessionId)}/complete`,
        {
          method: 'POST',
          body: JSON.stringify(resultData),
        }
      );
    },

    submitEvent: async (sessionId: string, event: unknown): Promise<{ success: boolean }> => {
      return this.request<{ success: boolean }>(
        `/v1/sessions/${encodeURIComponent(sessionId)}/events`,
        {
          method: 'POST',
          body: JSON.stringify(event),
        }
      );
    },
  };

  public leaderboards = {
    get: async (query: LeaderboardQuery = {}): Promise<Leaderboard> => {
      const params = new URLSearchParams();
      if (query.gameId) params.append('gameId', query.gameId);
      if (query.tenantId) params.append('tenantId', query.tenantId);
      if (query.period) params.append('period', query.period);
      if (query.scope) params.append('scope', query.scope);
      if (query.limit) params.append('limit', query.limit.toString());
      if (query.offset) params.append('offset', query.offset.toString());
      const queryStr = params.toString() ? `?${params.toString()}` : '';

      const targetGameId = query.gameId ? encodeURIComponent(query.gameId) : 'global';
      return this.request<Leaderboard>(`/v1/games/${targetGameId}/leaderboard${queryStr}`);
    },
  };

  public stats = {
    get: async (externalUserId: string): Promise<PlayerStats> => {
      return this.request<PlayerStats>(`/v1/users/${encodeURIComponent(externalUserId)}/stats`);
    },
  };
}
