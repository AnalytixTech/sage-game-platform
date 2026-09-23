"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const crypto_1 = __importDefault(require("crypto"));
const app = (0, express_1.default)();
app.use(express_1.default.json());
// In-Memory Database Store for Demonstration & Execution Testing
const mockTenants = new Map([
    ['tenant_campus_app', { id: 'tenant_campus_app', name: 'CampusApp', secret: 'sec_campus_secret_123' }],
    ['tenant_fitness_app', { id: 'tenant_fitness_app', name: 'FitnessApp', secret: 'sec_fitness_secret_456' }],
]);
const mockTenantAccess = new Map([
    ['tenant_campus_app', new Set(['game_quiz_001', 'game_word_001', 'game_memory_001'])],
    ['tenant_fitness_app', new Set(['game_memory_001', 'game_puzzle_001'])],
]);
const mockGames = [
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
];
const mockSessions = new Map();
const mockResults = new Map();
const mockLeaderboards = [
    {
        rank: 1,
        externalUserId: 'user_alex',
        username: 'Alex Master',
        score: 2500,
        achievedAt: new Date(Date.now() - 3600000).toISOString(),
        gameId: 'game_quiz_001',
    },
    {
        rank: 2,
        externalUserId: 'user_sara',
        username: 'Sara Quizzer',
        score: 2100,
        achievedAt: new Date(Date.now() - 7200000).toISOString(),
        gameId: 'game_quiz_001',
    },
];
// Auth Middleware for Host Application Secret (Server-to-Server)
function authenticateHostSecret(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }
    const secret = authHeader.replace('Bearer ', '');
    let matchedTenantId = null;
    mockTenants.forEach((tenant, tenantId) => {
        if (tenant.secret === secret) {
            matchedTenantId = tenantId;
        }
    });
    if (!matchedTenantId) {
        return res.status(403).json({ error: 'Invalid Host Application Secret' });
    }
    req.tenantId = matchedTenantId;
    next();
}
// Auth Middleware for Short-Lived Session Token (SDK Client)
function authenticateSessionToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing session token' });
    }
    const token = authHeader.replace('Bearer ', '');
    let foundSession = null;
    mockSessions.forEach((sess) => {
        if (sess.sessionToken === token) {
            foundSession = sess;
        }
    });
    if (!foundSession) {
        return res.status(401).json({ error: 'Invalid or expired session token' });
    }
    const sessionObj = foundSession;
    if (new Date(sessionObj.expiresAt).getTime() <= Date.now()) {
        sessionObj.status = 'expired';
        return res.status(401).json({ error: 'Session token has expired' });
    }
    req.session = sessionObj;
    req.tenantId = sessionObj.tenantId;
    next();
}
// 1. GET /v1/games - Retrieve catalog (filtered by tenant access if authenticated or category)
app.get('/v1/games', (req, res) => {
    const category = req.query.category;
    const tenantId = req.tenantId || 'tenant_campus_app';
    const allowedGames = mockTenantAccess.get(tenantId) || new Set(mockGames.map((g) => g.id));
    let games = mockGames.filter((g) => allowedGames.has(g.id));
    if (category) {
        games = games.filter((g) => g.category === category);
    }
    res.json(games);
});
// 2. GET /v1/games/:gameId
app.get('/v1/games/:gameId', (req, res) => {
    const game = mockGames.find((g) => g.id === req.params.gameId || g.slug === req.params.gameId);
    if (!game) {
        return res.status(404).json({ error: 'Game not found' });
    }
    res.json(game);
});
// 3. POST /v1/sessions - Host Backend requests game session
app.post('/v1/sessions', authenticateHostSecret, (req, res) => {
    const tenantId = req.tenantId;
    const body = req.body;
    if (!body.gameId || !body.externalUserId) {
        return res.status(400).json({ error: 'gameId and externalUserId are required' });
    }
    const tenantGames = mockTenantAccess.get(tenantId);
    if (tenantGames && !tenantGames.has(body.gameId)) {
        return res.status(403).json({ error: `Tenant application is not permitted to access game ${body.gameId}` });
    }
    const sessionId = `sess_${crypto_1.default.randomBytes(8).toString('hex')}`;
    const sessionToken = `stk_${crypto_1.default.randomBytes(16).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString(); // 1 hour validity
    const session = {
        id: sessionId,
        tenantId,
        externalUserId: body.externalUserId,
        gameId: body.gameId,
        sessionToken,
        status: 'created',
        expiresAt,
        metadata: body.metadata,
    };
    mockSessions.set(sessionId, session);
    const response = {
        sessionId,
        sessionToken,
        gameId: body.gameId,
        expiresAt,
    };
    res.status(201).json(response);
});
// 4. GET /v1/sessions/:sessionId
app.get('/v1/sessions/:sessionId', (req, res) => {
    const session = mockSessions.get(req.params.sessionId);
    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }
    res.json(session);
});
// 5. POST /v1/sessions/:sessionId/start
app.post('/v1/sessions/:sessionId/start', authenticateSessionToken, (req, res) => {
    const session = req.session;
    session.status = 'active';
    session.startedAt = new Date().toISOString();
    res.json(session);
});
// 6. POST /v1/sessions/:sessionId/pause
app.post('/v1/sessions/:sessionId/pause', authenticateSessionToken, (req, res) => {
    const session = req.session;
    session.status = 'paused';
    res.json(session);
});
// 7. POST /v1/sessions/:sessionId/resume
app.post('/v1/sessions/:sessionId/resume', authenticateSessionToken, (req, res) => {
    const session = req.session;
    session.status = 'active';
    res.json(session);
});
// 8. POST /v1/sessions/:sessionId/events
app.post('/v1/sessions/:sessionId/events', authenticateSessionToken, (req, res) => {
    res.json({ success: true, timestamp: new Date().toISOString() });
});
// 9. POST /v1/sessions/:sessionId/complete - Complete game & validate scores
app.post('/v1/sessions/:sessionId/complete', authenticateSessionToken, (req, res) => {
    const session = req.session;
    const { score, duration, data } = req.body;
    if (typeof score !== 'number' || typeof duration !== 'number') {
        return res.status(400).json({ error: 'score and duration are required numeric values' });
    }
    // Server-side Score Validation Rule: Prevent unreasonable scores (> 100,000 per session)
    const MAX_VALID_SCORE = 100000;
    const sanitizedScore = Math.min(Math.max(0, score), MAX_VALID_SCORE);
    session.status = 'completed';
    session.completedAt = new Date().toISOString();
    const gameResult = {
        sessionId: session.id,
        gameId: session.gameId,
        externalUserId: session.externalUserId,
        score: sanitizedScore,
        duration,
        completedAt: session.completedAt,
        data,
    };
    mockResults.set(session.id, gameResult);
    // Update Leaderboard Mock
    mockLeaderboards.push({
        rank: mockLeaderboards.length + 1,
        externalUserId: session.externalUserId,
        username: session.metadata?.name || session.externalUserId,
        score: sanitizedScore,
        achievedAt: session.completedAt,
        gameId: session.gameId,
    });
    // Sort leaderboard descending
    mockLeaderboards.sort((a, b) => b.score - a.score);
    mockLeaderboards.forEach((entry, idx) => (entry.rank = idx + 1));
    res.json(gameResult);
});
// 10. GET /v1/games/:gameId/leaderboard
app.get('/v1/games/:gameId/leaderboard', (req, res) => {
    const gameId = req.params.gameId;
    const entries = gameId === 'global'
        ? mockLeaderboards
        : mockLeaderboards.filter((e) => e.gameId === gameId);
    const leaderboard = {
        gameId: gameId === 'global' ? undefined : gameId,
        period: req.query.period || 'all_time',
        entries,
        totalPlayers: entries.length,
    };
    res.json(leaderboard);
});
// 11. GET /v1/users/:externalUserId/stats
app.get('/v1/users/:externalUserId/stats', (req, res) => {
    const externalUserId = req.params.externalUserId;
    const userResults = Array.from(mockResults.values()).filter((r) => r.externalUserId === externalUserId);
    const totalScore = userResults.reduce((acc, r) => acc + r.score, 0);
    const gamesPlayed = userResults.length;
    const averageScore = gamesPlayed > 0 ? totalScore / gamesPlayed : 0;
    const stats = {
        externalUserId,
        gamesPlayed,
        gamesCompleted: gamesPlayed,
        totalScore,
        averageScore,
        perGameStats: {},
    };
    res.json(stats);
});
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`SageGame Platform REST API Server listening on http://localhost:${PORT}`);
});
//# sourceMappingURL=server.js.map