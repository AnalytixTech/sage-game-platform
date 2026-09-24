import {
  ActionLog,
  ApiErrorBody,
  CompletionResult,
  Game,
  GameCategory,
  Leaderboard,
  LeaderboardPeriod,
  PlayInfo,
} from '@sagegames/types';

export const DEFAULT_BASE_URL = 'https://sage-game-platform.onrender.com';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface SageGameClientOptions {
  /** API origin, e.g. https://sage-game-platform.onrender.com */
  baseUrl?: string;
  /** Custom fetch (tests, polyfills). Defaults to the global fetch. */
  fetch?: FetchLike;
}

export class SageApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = 'SageApiError';
  }

  /** Worth retrying: network failure (status 0), rate limit or a server error. */
  get retryable(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

export interface LeaderboardQuery {
  /** 'context' (default) limits the board to the session's chat/group; 'game' covers the whole app. */
  scope?: 'context' | 'game';
  period?: LeaderboardPeriod;
  limit?: number;
  offset?: number;
}

function query(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined) as [string, string | number][];
  return entries.length ? `?${entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&')}` : '';
}

async function request<T>(fetchImpl: FetchLike, url: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  // Only send Content-Type with a body: on a GET it would force a CORS preflight.
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetchImpl(url, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
  } catch (err) {
    throw new SageApiError(0, err instanceof Error ? err.message : 'Network request failed', 'network_error');
  }

  const text = await res.text();
  let body: unknown = undefined;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }
  // /complete answers 422 with a full CompletionResult when the log is rejected.
  if (res.ok || (res.status === 422 && typeof body === 'object' && body !== null && 'status' in body)) {
    return body as T;
  }
  const err = (body ?? {}) as ApiErrorBody;
  throw new SageApiError(res.status, err.error ?? `Request failed (${res.status})`, err.code, body);
}

/**
 * Public SageGames API client. Session calls go through `forSession(token)`, which returns a
 * client bound to one session token, so tokens are never shared between games.
 */
export class SageGameClient {
  public readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: SageGameClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    const f = options.fetch ?? (globalThis.fetch as FetchLike | undefined);
    if (!f) throw new Error('No fetch implementation available; pass options.fetch');
    this.fetchImpl = (input, init) => f(input, init);
  }

  public games = {
    list: (filter: { category?: GameCategory } = {}): Promise<Game[]> =>
      request<Game[]>(this.fetchImpl, `${this.baseUrl}/v2/games${query({ category: filter.category })}`),
    get: (gameId: string): Promise<Game> =>
      request<Game>(this.fetchImpl, `${this.baseUrl}/v2/games/${encodeURIComponent(gameId)}`),
  };

  public forSession(sessionToken: string): SessionClient {
    return new SessionClient(this.baseUrl, this.fetchImpl, sessionToken);
  }
}

export class SessionClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: FetchLike,
    private readonly token: string
  ) {}

  private url(sessionId: string, path: string) {
    return `${this.baseUrl}/v2/sessions/${encodeURIComponent(sessionId)}${path}`;
  }

  play(sessionId: string): Promise<PlayInfo> {
    return request<PlayInfo>(this.fetchImpl, this.url(sessionId, '/play'), {}, this.token);
  }

  start(sessionId: string, rulesVersion: number): Promise<PlayInfo> {
    return request<PlayInfo>(
      this.fetchImpl,
      this.url(sessionId, '/start'),
      { method: 'POST', body: JSON.stringify({ rulesVersion }) },
      this.token
    );
  }

  complete<TResult = Record<string, unknown>>(sessionId: string, log: ActionLog): Promise<CompletionResult<TResult>> {
    return request<CompletionResult<TResult>>(
      this.fetchImpl,
      this.url(sessionId, '/complete'),
      { method: 'POST', body: JSON.stringify({ log }) },
      this.token
    );
  }

  leaderboard(sessionId: string, q: LeaderboardQuery = {}): Promise<Leaderboard> {
    return request<Leaderboard>(
      this.fetchImpl,
      this.url(sessionId, `/leaderboard${query({ scope: q.scope, period: q.period, limit: q.limit, offset: q.offset })}`),
      {},
      this.token
    );
  }
}
