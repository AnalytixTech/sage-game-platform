/**
 * Example host backend: the only place the SageGames API key lives.
 *
 *   SAGEGAMES_API_URL=https://sage-game-platform.onrender.com \
 *   SAGEGAMES_API_KEY=sk_live_… \
 *   SAGEGAMES_WEBHOOK_SECRET=whsec_… \
 *   npx ts-node server.ts
 *
 * Your app calls POST /api/games/session and gets back { sessionId, sessionToken } for the
 * signed-in user. The SDK does everything else. Verified results arrive on the webhook.
 */
import crypto from 'crypto';
import express, { NextFunction, Request, Response } from 'express';

const SAGEGAMES_API_URL = process.env.SAGEGAMES_API_URL ?? 'https://sage-game-platform.onrender.com';
const SAGEGAMES_API_KEY = process.env.SAGEGAMES_API_KEY;
const SAGEGAMES_WEBHOOK_SECRET = process.env.SAGEGAMES_WEBHOOK_SECRET;
if (!SAGEGAMES_API_KEY) throw new Error('SAGEGAMES_API_KEY is required (create one in the SageGames portal)');

const app = express();

// Local demo only: let the example web app on another port call this server.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.APP_ORIGIN ?? 'http://localhost:5173');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Demo-User');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

/** Stand-in for your real auth middleware (JWT, session cookie…). */
function requireUser(req: Request, res: Response, next: NextFunction) {
  const id = req.header('X-Demo-User');
  if (!id) return res.status(401).json({ error: 'Sign in first' });
  res.locals.user = { id, name: id === 'user_123' ? 'Ada' : id };
  next();
}

// 1. Start a game for the signed-in user.
app.post('/api/games/session', express.json(), requireUser, async (req, res) => {
  const { gameId, contextId } = req.body ?? {};
  if (typeof gameId !== 'string') return res.status(400).json({ error: 'gameId is required' });
  const user = res.locals.user as { id: string; name: string };

  const response = await fetch(`${SAGEGAMES_API_URL}/v2/sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SAGEGAMES_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gameId,
      externalUserId: user.id,
      displayName: user.name,
      // Optional: groups leaderboards per chat, e.g. "dm:<conversationId>" or "group:<groupId>"
      contextId: typeof contextId === 'string' ? contextId : undefined,
    }),
  });
  const body = await response.json();
  if (!response.ok) return res.status(response.status).json({ error: body.error ?? 'Could not start the game' });

  // Only the session credentials go to the app, never the API key.
  res.json({ sessionId: body.sessionId, sessionToken: body.sessionToken });
});

// 2. Receive verified results. Use the raw body: the signature covers the exact bytes sent.
app.post('/api/webhooks/sagegames', express.raw({ type: 'application/json' }), (req, res) => {
  const body = req.body.toString('utf8');
  if (!SAGEGAMES_WEBHOOK_SECRET || !verifySignature(SAGEGAMES_WEBHOOK_SECRET, body, req.header('Sage-Signature') ?? '')) {
    return res.status(400).send('invalid signature');
  }
  const event = JSON.parse(body);
  if (event.type === 'session.completed' && event.data.valid) {
    console.log(`${event.data.displayName} scored ${event.data.score} in ${event.data.gameId} (${event.data.contextId ?? 'no context'})`);
    // e.g. award points, post the result into the chat…
  }
  res.sendStatus(200); // respond quickly; failed deliveries are retried with backoff
});

/** Sage-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>"> */
function verifySignature(secret: string, body: string, header: string, toleranceSec = 300): boolean {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > toleranceSec || !parts.v1) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest();
  const given = Buffer.from(parts.v1, 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

const PORT = Number(process.env.PORT ?? 5000);
app.listen(PORT, () => console.log(`Example host backend on http://localhost:${PORT}`));
