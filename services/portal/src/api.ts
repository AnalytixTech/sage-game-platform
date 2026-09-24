import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface PortalConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  apiBaseUrl: string;
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

let supabase: SupabaseClient | null = null;
let config: PortalConfig | null = null;

/** Load public settings from the API and create the Supabase client. */
export async function init(): Promise<{ supabase: SupabaseClient; config: PortalConfig }> {
  if (supabase && config) return { supabase, config };
  const res = await fetch(`${import.meta.env.BASE_URL}api/config`);
  if (!res.ok) throw new Error('Could not load portal settings');
  config = (await res.json()) as PortalConfig;
  supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return { supabase, config };
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

/** Call the portal API with the current Supabase access token. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!supabase) throw new Error('Portal not initialised');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`${import.meta.env.BASE_URL}api${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
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
