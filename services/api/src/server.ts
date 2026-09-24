import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import {
  CreateSessionRequest,
  CreateSessionResponse,
  Game,
  GameResult,
  GameSession,
  Leaderboard,
  LeaderboardEntry,
  LeaderboardPeriod,
  PlayerStats,
} from '@sagegames/types';

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '256kb' }));

// CORS: the API only uses bearer tokens (no cookies), so any origin may call it.
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Max-Age', '600');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// ---------------------------------------------------------------------------
// Tenants & host keys
// Secrets come from SAGE_TENANT_KEYS="tenant_id:secret,tenant_id:secret".
// They are never stored in source; only their SHA-256 digests are kept in memory.
// ---------------------------------------------------------------------------

interface Tenant {
  id: string;
  name: string;
  secretDigest: Buffer;
}

const TENANT_NAMES: Record<string, string> = {
  tenant_campus_app: 'CampusApp',
  tenant_fitness_app: 'FitnessApp',
};

const sha256 = (value: string): Buffer => crypto.createHash('sha256').update(value).digest();

function loadTenants(): Map<string, Tenant> {
  const tenants = new Map<string, Tenant>();
  const raw = process.env.SAGE_TENANT_KEYS || '';

  raw
    .split(',')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .forEach((pair) => {
      const sep = pair.indexOf(':');
      const id = pair.slice(0, sep).trim();
      const secret = pair.slice(sep + 1).trim();
      if (sep <= 0 || secret.length < 24) {
        throw new Error(`SAGE_TENANT_KEYS entry for '${id || pair}' is malformed or its secret is shorter than 24 chars`);
      }
      tenants.set(id, { id, name: TENANT_NAMES[id] || id, secretDigest: sha256(secret) });
    });

  if (tenants.size === 0) {
    if (process.env.NODE_ENV === 'production') {
      console.error('SAGE_TENANT_KEYS is not set: host session creation is disabled until it is configured.');
    } else {
      const devSecret = `sk_dev_${crypto.randomBytes(18).toString('hex')}`;
      tenants.set('tenant_campus_app', {
        id: 'tenant_campus_app',
        name: 'CampusApp',
        secretDigest: sha256(devSecret),
      });
      console.warn(`[dev] SAGE_TENANT_KEYS not set. Generated a key for tenant_campus_app: ${devSecret}`);
    }
  }

  return tenants;
}

const tenants = loadTenants();

const tenantAccess = new Map<string, Set<string>>([
  ['tenant_campus_app', new Set(['game_quiz_001', 'game_word_001', 'game_memory_001', 'game_word_search_001', 'game_sudoku_001'])],
  ['tenant_fitness_app', new Set(['game_memory_001', 'game_sudoku_001'])],
]);

function findTenantBySecret(secret: string): Tenant | null {
  const digest = sha256(secret);
  let match: Tenant | null = null;
  // Compare against every tenant with a constant-time check.
  tenants.forEach((tenant) => {
    if (crypto.timingSafeEqual(tenant.secretDigest, digest)) {
      match = tenant;
    }
  });
  return match;
}

function bearer(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim() || null;
}

// ---------------------------------------------------------------------------
// In-memory stores (replaced by Postgres in the v2 API)
// ---------------------------------------------------------------------------

const games: Game[] = [
  {
    id: 'game_quiz_001',
    slug: 'quiz-master',
    name: 'Quiz Master',
    description: 'Test your knowledge across diverse topics with timed trivia questions.',
    version: '1.0.0',
    category: 'quiz',
    status: 'published',
    deliveryModel: 'sdk_rendered',
    supportedPlatforms: ['web', 'ios', 'android'],
    thumbnail: 'https://images.unsplash.com/photo-1606326608606-aa0b62935f2b?auto=format&w=400',
  },
  {
    id: 'game_word_001',
    slug: 'word-rush',
    name: 'Word Rush',
    description: 'Find as many hidden words as possible before time runs out!',
    version: '1.0.0',
    category: 'word',
    status: 'published',
    deliveryModel: 'sdk_rendered',
    supportedPlatforms: ['web', 'ios', 'android'],
    thumbnail: 'https://images.unsplash.com/photo-1546776310-eef45dd6d63c?auto=format&w=400',
  },
  {
    id: 'game_memory_001',
    slug: 'memory-match',
    name: 'Memory Match',
    description: 'Sharpen your memory by finding matching cards with minimal moves.',
    version: '1.0.0',
    category: 'memory',
    status: 'published',
    deliveryModel: 'sdk_rendered',
    supportedPlatforms: ['web', 'ios', 'android'],
    thumbnail: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&w=400',
  },
  {
    id: 'game_word_search_001',
    slug: 'word-search',
    name: 'Word Search',
    description: 'Find hidden words in a grid. Configurable custom word lists and categories!',
    version: '1.0.0',
    category: 'word',
    status: 'published',
    deliveryModel: 'sdk_rendered',
    supportedPlatforms: ['web', 'ios', 'android'],
    thumbnail: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&w=400',
  },
  {
    id: 'game_sudoku_001',
    slug: 'sudoku-arena',
    name: 'Sudoku Arena',
    description: 'Classic 9x9 Sudoku puzzle challenge with difficulty levels and hints.',
    version: '1.0.0',
    category: 'puzzle',
    status: 'published',
    deliveryModel: 'sdk_rendered',
    supportedPlatforms: ['web', 'ios', 'android'],
    thumbnail: 'https://images.unsplash.com/photo-1580541832626-2a7131ee809f?auto=format&w=400',
  },
];

// Sessions are stored without their token; tokens are looked up by digest.
const sessions = new Map<string, GameSession>();
const sessionIdByTokenDigest = new Map<string, string>();

interface StoredResult extends GameResult {
  tenantId: string;
  // v1 results are client-reported and cannot be verified; they never reach leaderboards.
  verified: boolean;
}

const results = new Map<string, StoredResult>();

interface StoredLeaderboardEntry extends Omit<LeaderboardEntry, 'rank'> {
  tenantId: string;
}

// Leaderboards only contain verified results. Until the v2 replay API ships, that is none.
const leaderboardEntries: StoredLeaderboardEntry[] = [];

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------

// Host Application Secret (server-to-server only)
function authenticateHostSecret(req: Request, res: Response, next: NextFunction) {
  const secret = bearer(req);
  if (!secret) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const tenant = findTenantBySecret(secret);
  if (!tenant) {
    return res.status(403).json({ error: 'Invalid Host Application Secret' });
  }

  res.locals.tenantId = tenant.id;
  next();
}

// Short-lived session token (SDK client), scoped to the :sessionId in the URL
function authenticateSessionToken(req: Request, res: Response, next: NextFunction) {
  const token = bearer(req);
  if (!token) {
    return res.status(401).json({ error: 'Missing session token' });
  }

  const sessionId = sessionIdByTokenDigest.get(sha256(token).toString('hex'));
  const session = sessionId ? sessions.get(sessionId) : undefined;

  if (!session || session.id !== req.params.sessionId) {
    return res.status(401).json({ error: 'Invalid or expired session token' });
  }

  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    if (session.status !== 'completed') session.status = 'expired';
    return res.status(401).json({ error: 'Session token has expired' });
  }

  res.locals.session = session;
  res.locals.tenantId = session.tenantId;
  next();
}

// Session reads accept either the owning tenant's host key or the session's own token.
function authenticateSessionRead(req: Request, res: Response, next: NextFunction) {
  const token = bearer(req);
  if (token && findTenantBySecret(token)) {
    return authenticateHostSecret(req, res, next);
  }
  return authenticateSessionToken(req, res, next);
}

// Session state machine for the v1 lifecycle endpoints
function transition(
  from: GameSession['status'][],
  to: GameSession['status'],
  onEnter?: (session: GameSession) => void
) {
  return (req: Request, res: Response) => {
    const session: GameSession = res.locals.session;
    if (!from.includes(session.status)) {
      return res.status(409).json({ error: `Cannot move session from '${session.status}' to '${to}'` });
    }
    session.status = to;
    onEnter?.(session);
    res.json(publicSession(session, false));
  };
}

function publicSession(session: GameSession, includeMetadata: boolean): GameSession {
  const { sessionToken: _omit, metadata, ...rest } = session;
  return includeMetadata ? { ...rest, metadata } : rest;
}

function parsePeriod(value: unknown): LeaderboardPeriod {
  return value === 'daily' || value === 'weekly' || value === 'monthly' ? value : 'all_time';
}

function periodStart(period: LeaderboardPeriod): number {
  const day = 24 * 3600 * 1000;
  switch (period) {
    case 'daily':
      return Date.now() - day;
    case 'weekly':
      return Date.now() - 7 * day;
    case 'monthly':
      return Date.now() - 30 * day;
    default:
      return 0;
  }
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get('/healthz', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

// 1. GET /v1/games - Public catalog. With a host key, only that tenant's games are listed.
app.get('/v1/games', (req: Request, res: Response) => {
  const category = req.query.category as string | undefined;
  const secret = bearer(req);
  const tenant = secret ? findTenantBySecret(secret) : null;
  const allowed = tenant ? tenantAccess.get(tenant.id) : undefined;

  let list = games.filter((g) => g.status === 'published');
  if (allowed) {
    list = list.filter((g) => allowed.has(g.id));
  }
  if (category) {
    list = list.filter((g) => g.category === category);
  }

  res.json(list);
});

// 2. GET /v1/games/:gameId - Public game metadata (access is enforced when a session is created)
app.get('/v1/games/:gameId', (req: Request, res: Response) => {
  const game = games.find((g) => g.id === req.params.gameId || g.slug === req.params.gameId);
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }
  res.json(game);
});

// 3. POST /v1/sessions - Host Backend requests a game session
app.post('/v1/sessions', authenticateHostSecret, (req: Request, res: Response) => {
  const tenantId: string = res.locals.tenantId;
  const body: CreateSessionRequest = req.body || {};

  if (typeof body.gameId !== 'string' || typeof body.externalUserId !== 'string' || !body.externalUserId) {
    return res.status(400).json({ error: 'gameId and externalUserId are required strings' });
  }

  if (!games.some((g) => g.id === body.gameId)) {
    return res.status(404).json({ error: 'Game not found' });
  }

  if (!tenantAccess.get(tenantId)?.has(body.gameId)) {
    return res.status(403).json({ error: `Tenant application is not permitted to access game ${body.gameId}` });
  }

  const sessionId = `sess_${crypto.randomBytes(12).toString('hex')}`;
  const sessionToken = `stk_${crypto.randomBytes(32).toString('hex')}`;
  const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString(); // 1 hour validity

  const session: GameSession = {
    id: sessionId,
    tenantId,
    externalUserId: body.externalUserId,
    gameId: body.gameId,
    status: 'created',
    expiresAt,
    metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : undefined,
  };

  sessions.set(sessionId, session);
  sessionIdByTokenDigest.set(sha256(sessionToken).toString('hex'), sessionId);

  const response: CreateSessionResponse = {
    sessionId,
    sessionToken,
    gameId: body.gameId,
    expiresAt,
  };

  res.status(201).json(response);
});

// 4. GET /v1/sessions/:sessionId - Owning host (with metadata) or the session's own token (without)
app.get('/v1/sessions/:sessionId', authenticateSessionRead, (req: Request, res: Response) => {
  const session = res.locals.session ?? sessions.get(req.params.sessionId);
  if (!session || session.tenantId !== res.locals.tenantId) {
    return res.status(404).json({ error: 'Session not found' });
  }
  const isHost = !res.locals.session;
  res.json(publicSession(session, isHost));
});

// 5-7. Lifecycle transitions
app.post(
  '/v1/sessions/:sessionId/start',
  authenticateSessionToken,
  transition(['created'], 'active', (s) => {
    s.startedAt = new Date().toISOString();
  })
);
app.post('/v1/sessions/:sessionId/pause', authenticateSessionToken, transition(['active'], 'paused'));
app.post('/v1/sessions/:sessionId/resume', authenticateSessionToken, transition(['paused'], 'active'));

// 8. POST /v1/sessions/:sessionId/events
app.post('/v1/sessions/:sessionId/events', authenticateSessionToken, (_req: Request, res: Response) => {
  res.json({ success: true, timestamp: new Date().toISOString() });
});

// 9. POST /v1/sessions/:sessionId/complete
// v1 scores are reported by the client and cannot be verified. They are recorded once per
// session for the host's own use, but never enter leaderboards.
app.post('/v1/sessions/:sessionId/complete', authenticateSessionToken, (req: Request, res: Response) => {
  const session: GameSession = res.locals.session;
  const { score, duration, data } = req.body || {};

  if (session.status !== 'active' && session.status !== 'paused') {
    return res.status(409).json({ error: `Session cannot be completed from status '${session.status}'` });
  }

  if (!Number.isFinite(score) || !Number.isFinite(duration) || duration < 0) {
    return res.status(400).json({ error: 'score and duration are required non-negative numbers' });
  }

  const elapsedSeconds = session.startedAt
    ? (Date.now() - new Date(session.startedAt).getTime()) / 1000
    : 0;
  if (duration > elapsedSeconds + 5) {
    return res.status(422).json({ error: 'duration exceeds the time since the session started' });
  }

  const MAX_VALID_SCORE = 100000;
  session.status = 'completed';
  session.completedAt = new Date().toISOString();

  const result: StoredResult = {
    sessionId: session.id,
    gameId: session.gameId,
    externalUserId: session.externalUserId,
    tenantId: session.tenantId,
    score: Math.min(Math.max(0, Math.floor(score)), MAX_VALID_SCORE),
    duration: Math.floor(duration),
    completedAt: session.completedAt,
    data: data && typeof data === 'object' ? data : {},
    verified: false,
  };

  results.set(session.id, result);

  const { tenantId: _t, verified: _v, ...publicResult } = result;
  res.json(publicResult);
});

// 10. GET /v1/games/:gameId/leaderboard - Host only, scoped to the host's tenant
app.get('/v1/games/:gameId/leaderboard', authenticateHostSecret, (req: Request, res: Response) => {
  const tenantId: string = res.locals.tenantId;
  const gameId = req.params.gameId;
  const period = parsePeriod(req.query.period);
  const since = periodStart(period);
  const limit = clampInt(req.query.limit, 50, 1, 100);
  const offset = clampInt(req.query.offset, 0, 0, 10000);

  // Best score per user
  const best = new Map<string, StoredLeaderboardEntry>();
  leaderboardEntries
    .filter(
      (e) =>
        e.tenantId === tenantId &&
        (gameId === 'global' || e.gameId === gameId) &&
        new Date(e.achievedAt).getTime() >= since
    )
    .forEach((e) => {
      const current = best.get(e.externalUserId);
      if (!current || e.score > current.score) best.set(e.externalUserId, e);
    });

  const ranked = Array.from(best.values())
    .sort((a, b) => b.score - a.score || a.achievedAt.localeCompare(b.achievedAt))
    .map(({ tenantId: _t, ...entry }, idx) => ({ ...entry, rank: idx + 1 }));

  const leaderboard: Leaderboard = {
    gameId: gameId === 'global' ? undefined : gameId,
    period,
    entries: ranked.slice(offset, offset + limit),
    totalPlayers: ranked.length,
  };

  res.json(leaderboard);
});

// 11. GET /v1/users/:externalUserId/stats - Host only, scoped to the host's tenant
app.get('/v1/users/:externalUserId/stats', authenticateHostSecret, (req: Request, res: Response) => {
  const tenantId: string = res.locals.tenantId;
  const externalUserId = req.params.externalUserId;
  const userResults = Array.from(results.values()).filter(
    (r) => r.tenantId === tenantId && r.externalUserId === externalUserId
  );
  const userSessions = Array.from(sessions.values()).filter(
    (s) => s.tenantId === tenantId && s.externalUserId === externalUserId && s.status !== 'created'
  );

  const totalScore = userResults.reduce((acc, r) => acc + r.score, 0);
  const gamesCompleted = userResults.length;

  const stats: PlayerStats = {
    externalUserId,
    gamesPlayed: userSessions.length,
    gamesCompleted,
    totalScore,
    averageScore: gamesCompleted > 0 ? totalScore / gamesCompleted : 0,
    perGameStats: {},
  };

  res.json(stats);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`SageGame Platform REST API Server listening on http://localhost:${PORT}`);
});
