export interface PortalConfig {
  apiBaseUrl: string;
}

export interface PortalUser {
  id: string;
  email: string;
}

export interface AppSummary {
  id: string;
  name: string;
  status: string;
  role: 'owner' | 'admin';
  gameIds: string[];
  webhookUrl: string | null;
  createdAt: string;
}

export interface ApiKey {
  id: string;
  mode: 'live' | 'test';
  label: string;
  preview: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  key?: string;
}

export interface Game {
  id: string;
  name: string;
  description?: string;
  category: string;
}

export interface WebhookInfo {
  url: string | null;
  secret: string | null;
  recentDeliveries: {
    id: string;
    event: string;
    status: string;
    attempts: number;
    lastError: string | null;
    createdAt: string;
    deliveredAt: string | null;
  }[];
}

export interface UsageDay {
  day: string;
  sessions: number;
  completed: number;
  verified: number;
}

export interface RecentResult {
  sessionId: string;
  gameId: string;
  externalUserId: string;
  displayName: string | null;
  status: string;
  valid: boolean;
  isTest: boolean;
  score: number;
  completedAt: string;
}

export interface QuizBankSummary {
  bankId: string;
  name: string;
  questionCount: number;
  updatedAt: string;
}

export interface QuizQuestion {
  id?: string;
  question: string;
  answer: string;
  wrong: string[];
  category?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
}

export interface QuizBank {
  bankId: string;
  name: string;
  questions: QuizQuestion[];
}

let config: PortalConfig | null = null;

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

// ---------------------------------------------------------------- Session
//
// The access token lives only in memory. The refresh token is an httpOnly cookie (scoped to
// /portal) the browser sends to /auth/refresh; each refresh spends it and sets a new one.

let accessToken: string | null = null;
let currentUser: PortalUser | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let refreshing: Promise<boolean> | null = null;
const listeners = new Set<(user: PortalUser | null) => void>();

const BASE = `${import.meta.env.BASE_URL}api`;
const AJAX = { 'X-Requested-With': 'sagegames-portal' };

/** Be told when the user signs in or out (returns an unsubscribe function). */
export function onAuthChange(listener: (user: PortalUser | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getUser = () => currentUser;

function setSession(session: { accessToken: string; expiresIn: number; user: PortalUser } | null) {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
  accessToken = session?.accessToken ?? null;
  currentUser = session?.user ?? null;
  if (session) {
    // Refresh a minute before the access token expires.
    refreshTimer = setTimeout(() => void refresh(), Math.max(10, session.expiresIn - 60) * 1000);
  }
  listeners.forEach((l) => l(currentUser));
}

async function post<T>(path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { ...AJAX, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`, data.code);
  return data as T;
}

/** Swap the refresh cookie for a new access token. One refresh at a time, across tabs too. */
export function refresh(): Promise<boolean> {
  if (!refreshing) {
    const attempt = async () => {
      try {
        setSession(await post('/auth/refresh'));
        return true;
      } catch {
        setSession(null);
        return false;
      }
    };
    const locks = navigator.locks as LockManager | undefined;
    const run = (locks ? locks.request('sg-portal-refresh', attempt) : attempt()) as Promise<boolean>;
    refreshing = run.finally(() => {
      refreshing = null;
    });
    return refreshing;
  }
  return refreshing;
}

type Session = { accessToken: string; expiresIn: number; user: PortalUser };

export const auth = {
  async signIn(email: string, password: string) {
    setSession(await post<Session>('/auth/login', { email, password }));
  },
  async signUp(email: string, password: string): Promise<string> {
    return (await post<{ message: string }>('/auth/signup', { email, password })).message;
  },
  async resendVerification(email: string): Promise<string> {
    return (await post<{ message: string }>('/auth/resend-verification', { email })).message;
  },
  async verifyEmail(token: string) {
    setSession(await post<Session>('/auth/verify-email', { token }));
  },
  async forgotPassword(email: string): Promise<string> {
    return (await post<{ message: string }>('/auth/forgot-password', { email })).message;
  },
  async resetPassword(token: string, password: string) {
    setSession(await post<Session>('/auth/reset-password', { token, password }));
  },
  async changePassword(currentPassword: string, newPassword: string) {
    setSession(await post<Session>('/auth/change-password', { currentPassword, newPassword }, bearer()));
  },
  async changeEmail(newEmail: string, password: string): Promise<string> {
    return (await post<{ message: string }>('/auth/change-email', { newEmail, password }, bearer())).message;
  },
  async deleteAccount(password: string) {
    await post('/auth/delete-account', { password }, bearer());
    setSession(null);
  },
  async signOut(everywhere = false) {
    try {
      await post('/auth/logout', everywhere ? { everywhere: true } : undefined, bearer());
    } finally {
      setSession(null);
    }
  },
};

const bearer = (): Record<string, string> => (accessToken ? { Authorization: `Bearer ${accessToken}` } : {});

/** Load public settings and restore the session from the refresh cookie, if any. */
export async function init(): Promise<{ config: PortalConfig; user: PortalUser | null }> {
  if (!config) {
    const res = await fetch(`${BASE}/config`);
    if (!res.ok) throw new Error('Could not load portal settings');
    config = (await res.json()) as PortalConfig;
    await refresh();
  }
  return { config, user: currentUser };
}

/** Call the portal API as the signed-in user (refreshing the access token once if it expired). */
export async function api<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...bearer(),
      ...init.headers,
    },
  });
  if (res.status === 401 && !retried && (await refresh())) return api<T>(path, init, true);
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`, body.code);
  return body as T;
}

export const json = (value: unknown): RequestInit['body'] => JSON.stringify(value);

export async function listGames(): Promise<Game[]> {
  const res = await fetch('/v2/games');
  return res.ok ? res.json() : [];
}
