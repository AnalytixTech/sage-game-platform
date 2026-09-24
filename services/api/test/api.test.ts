import { beforeEach, describe, expect, it } from 'vitest';
import { GameRuntime } from '@sagegames/core';
import { memoryMatchRules, MemoryMatchState } from '@sagegames/game-memory-match';
import { quizMasterRules } from '@sagegames/game-quiz-master';
import { dispatchDue } from '../src/webhooks/dispatcher';
import { verifyWebhookSignature } from '../src/webhooks/outbox';
import { createTestEnv, TestEnv } from './support/setup';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Sign up a developer, create an app and a key. */
async function setupApp(env: TestEnv, opts: { mode?: 'live' | 'test'; gameIds?: string[]; name?: string } = {}) {
  const dev = await env.signIn();
  const app = await env.api
    .post('/portal/api/apps')
    .set(auth(dev.token))
    .send({ name: opts.name ?? 'Japabudz', gameIds: opts.gameIds });
  expect(app.status).toBe(201);
  const key = await env.api
    .post(`/portal/api/apps/${app.body.id}/keys`)
    .set(auth(dev.token))
    .send({ label: 'server', mode: opts.mode ?? 'live' });
  expect(key.status).toBe(201);
  return { dev, appId: app.body.id as string, key: key.body.key as string, keyId: key.body.id as string };
}

async function createSession(env: TestEnv, key: string, body: Record<string, unknown> = {}) {
  const res = await env.api
    .post('/v2/sessions')
    .set(auth(key))
    .send({ gameId: 'game_memory_001', externalUserId: 'user_1', displayName: 'Ada', ...body });
  expect(res.status).toBe(201);
  return res.body as { sessionId: string; sessionToken: string; rulesVersion: number };
}

/** Play Memory Match the way the SDK will: fetch /play, start, play locally, return the log. */
async function playMemory(env: TestEnv, s: { sessionId: string; sessionToken: string }, mistakes = 0) {
  const play = await env.api.get(`/v2/sessions/${s.sessionId}/play`).set(auth(s.sessionToken));
  expect(play.status).toBe(200);
  const start = await env.api.post(`/v2/sessions/${s.sessionId}/start`).set(auth(s.sessionToken)).send({ rulesVersion: 1 });
  expect(start.status).toBe(200);

  const runtime = new GameRuntime({
    rules: memoryMatchRules,
    seed: play.body.seed,
    config: play.body.config,
    now: env.clock.ms,
  });
  runtime.start();
  const state = runtime.getSnapshot().state as MemoryMatchState;
  const pairs = new Map<string, number[]>();
  state.cards.forEach((c, i) => pairs.set(c.face, [...(pairs.get(c.face) ?? []), i]));
  const list = Array.from(pairs.values());

  for (let m = 0; m < mistakes; m++) {
    env.clock.advance(800);
    runtime.dispatch('FLIP', { index: list[0][0] });
    env.clock.advance(800);
    runtime.dispatch('FLIP', { index: list[1][0] });
  }
  for (const [a, b] of list) {
    env.clock.advance(800);
    runtime.dispatch('FLIP', { index: a });
    env.clock.advance(800);
    runtime.dispatch('FLIP', { index: b });
  }
  expect(runtime.getSnapshot().ended).toBe(true);
  return { log: runtime.getLog(), clientScore: runtime.getSnapshot().score, play: play.body };
}

describe('SageGames API', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv();
  });

  describe('developer portal', () => {
    it('requires a Supabase session', async () => {
      expect((await env.api.get('/portal/api/me')).status).toBe(401);
      expect((await env.api.get('/portal/api/me').set(auth('not-a-jwt'))).status).toBe(401);
    });

    it('serves public Supabase settings for the portal', async () => {
      const res = await env.api.get('/portal/api/config');
      expect(res.body).toEqual({
        supabaseUrl: env.config.supabaseUrl,
        supabaseAnonKey: env.config.supabaseAnonKey,
        apiBaseUrl: env.config.publicBaseUrl,
      });
    });

    it('creates apps and keys that are shown once and stored hashed', async () => {
      const { dev, appId, key, keyId } = await setupApp(env);
      expect(key).toMatch(/^sk_live_[0-9a-f]{16}_[0-9a-f]{48}$/);

      const me = await env.api.get('/portal/api/me').set(auth(dev.token));
      expect(me.body.apps).toHaveLength(1);
      expect(me.body.apps[0]).toMatchObject({ id: appId, name: 'Japabudz', role: 'owner' });
      expect(me.body.apps[0].gameIds).toHaveLength(5);

      const keys = await env.api.get(`/portal/api/apps/${appId}/keys`).set(auth(dev.token));
      expect(keys.body).toHaveLength(1);
      expect(JSON.stringify(keys.body)).not.toContain(key.split('_')[3]);
      const [row] = await env.db.query<{ key_hash: string }>('SELECT key_hash FROM api_keys WHERE id = $1', [keyId]);
      expect(row.key_hash).not.toContain(key.split('_')[3]);
    });

    it("keeps each developer's apps private", async () => {
      const { appId } = await setupApp(env);
      const other = await env.signIn();
      expect((await env.api.get(`/portal/api/apps/${appId}`).set(auth(other.token))).status).toBe(404);
      expect((await env.api.post(`/portal/api/apps/${appId}/keys`).set(auth(other.token)).send({})).status).toBe(404);
    });

    it('revoked keys stop working immediately', async () => {
      const { dev, appId, key, keyId } = await setupApp(env);
      await createSession(env, key);
      expect((await env.api.delete(`/portal/api/apps/${appId}/keys/${keyId}`).set(auth(dev.token))).status).toBe(204);
      const res = await env.api.post('/v2/sessions').set(auth(key)).send({ gameId: 'game_memory_001', externalUserId: 'u' });
      expect(res.status).toBe(403);
    });

    it('limits an app to the games it enabled', async () => {
      const { dev, appId, key } = await setupApp(env, { gameIds: ['game_sudoku_001'] });
      const res = await env.api.post('/v2/sessions').set(auth(key)).send({ gameId: 'game_memory_001', externalUserId: 'u' });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('game_not_enabled');

      const games = await env.api.get('/v2/games').set(auth(key));
      expect(games.body.map((g: { id: string }) => g.id)).toEqual(['game_sudoku_001']);

      await env.api.patch(`/portal/api/apps/${appId}`).set(auth(dev.token)).send({ gameIds: ['game_memory_001'] });
      await createSession(env, key);
    });

    it('rejects private webhook URLs in production', async () => {
      const prod = await createTestEnv({ env: 'production' });
      const { dev, appId } = await setupApp(prod);
      for (const url of ['http://example.com/hook', 'https://localhost/hook', 'https://10.0.0.5/hook', 'https://169.254.169.254/x']) {
        const res = await prod.api.put(`/portal/api/apps/${appId}/webhook`).set(auth(dev.token)).send({ url });
        expect(res.status, url).toBe(400);
      }
      const ok = await prod.api.put(`/portal/api/apps/${appId}/webhook`).set(auth(dev.token)).send({ url: 'https://hooks.example.com/sage' });
      expect(ok.status).toBe(200);
      expect(ok.body.secret).toMatch(/^whsec_/);
    });
  });

  describe('sessions and verified results', () => {
    it('rejects missing and invalid host keys', async () => {
      const body = { gameId: 'game_memory_001', externalUserId: 'u' };
      expect((await env.api.post('/v2/sessions').send(body)).status).toBe(401);
      expect((await env.api.post('/v2/sessions').set(auth('sk_live_0000000000000000_' + '0'.repeat(48))).send(body)).status).toBe(403);
      expect((await env.api.post('/v2/sessions').set(auth('sec_campus_secret_123')).send(body)).status).toBe(403);
    });

    it('validates game config', async () => {
      const { key } = await setupApp(env);
      const res = await env.api
        .post('/v2/sessions')
        .set(auth(key))
        .send({ gameId: 'game_sudoku_001', externalUserId: 'u', config: { variant: 'nope' } });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('invalid_config');
    });

    it('never exposes metadata or the token to the player', async () => {
      const { key } = await setupApp(env);
      const s = await createSession(env, key, { metadata: { email: 'ada@example.com' } });
      const play = await env.api.get(`/v2/sessions/${s.sessionId}/play`).set(auth(s.sessionToken));
      expect(JSON.stringify(play.body)).not.toContain('ada@example.com');
      expect(play.body).toMatchObject({ gameId: 'game_memory_001', rulesVersion: 1, status: 'created' });
      expect(play.body.seed).toMatch(/^[0-9a-f]{32}$/);
    });

    it('scopes a session token to its own session', async () => {
      const { key } = await setupApp(env);
      const a = await createSession(env, key);
      const b = await createSession(env, key, { externalUserId: 'user_2' });
      expect((await env.api.get(`/v2/sessions/${b.sessionId}/play`).set(auth(a.sessionToken))).status).toBe(401);
    });

    it('computes the score by replay, ignoring what the client claims', async () => {
      const { key } = await setupApp(env);
      const s = await createSession(env, key);
      const { log, clientScore } = await playMemory(env, s);
      const forged = { ...log, clientScore: 99_999 };

      const res = await env.api.post(`/v2/sessions/${s.sessionId}/complete`).set(auth(s.sessionToken)).send({ log: forged });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'verified', valid: true, score: clientScore, rank: 1, flags: [] });
      expect(res.body.score).toBe(6 * 150);
    });

    it('completion is idempotent for the same log and refused for a different one', async () => {
      const { key } = await setupApp(env);
      const s = await createSession(env, key);
      const { log } = await playMemory(env, s);
      const first = await env.api.post(`/v2/sessions/${s.sessionId}/complete`).set(auth(s.sessionToken)).send({ log });
      const retry = await env.api.post(`/v2/sessions/${s.sessionId}/complete`).set(auth(s.sessionToken)).send({ log });
      expect(retry.status).toBe(200);
      expect(retry.body).toEqual(first.body);

      const other = await env.api
        .post(`/v2/sessions/${s.sessionId}/complete`)
        .set(auth(s.sessionToken))
        .send({ log: { ...log, actions: log.actions.slice(0, 2) } });
      expect(other.status).toBe(409);
    });

    it('rejects tampered logs and keeps them off the leaderboard', async () => {
      const { key } = await setupApp(env);
      const s = await createSession(env, key);
      const { log } = await playMemory(env, s);
      const tampered = { ...log, actions: [...log.actions, [log.endT, 'WIN_GAME', {}]] };
      const res = await env.api.post(`/v2/sessions/${s.sessionId}/complete`).set(auth(s.sessionToken)).send({ log: tampered });
      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({ status: 'rejected', valid: false, score: 0, rejectCode: 'invalid_action' });

      const board = await env.api.get('/v2/leaderboards/game_memory_001').set(auth(key));
      expect(board.body.entries).toEqual([]);
    });

    it('rejects logs claiming more play time than the server saw', async () => {
      const { key } = await setupApp(env);
      const s = await createSession(env, key);
      const { log } = await playMemory(env, s);
      const stretched = { ...log, endT: log.endT + 10 * 60_000 };
      const res = await env.api.post(`/v2/sessions/${s.sessionId}/complete`).set(auth(s.sessionToken)).send({ log: stretched });
      expect(res.status).toBe(422);
      expect(res.body.rejectCode).toBe('time_exceeds_server');
    });

    it('requires start before complete and an up-to-date SDK', async () => {
      const { key } = await setupApp(env);
      const s = await createSession(env, key);
      const early = await env.api
        .post(`/v2/sessions/${s.sessionId}/complete`)
        .set(auth(s.sessionToken))
        .send({ log: { v: 1, gameId: 'game_memory_001', rulesVersion: 1, actions: [], endT: 0, reason: 'quit' } });
      expect(early.status).toBe(409);
      const outdated = await env.api.post(`/v2/sessions/${s.sessionId}/start`).set(auth(s.sessionToken)).send({ rulesVersion: 99 });
      expect(outdated.status).toBe(426);
    });

    it('expires tokens after an hour but lets a finished game submit within the grace period', async () => {
      const { key } = await setupApp(env);
      const s = await createSession(env, key);
      const { log } = await playMemory(env, s);
      env.clock.advance(61 * 60_000);
      expect((await env.api.get(`/v2/sessions/${s.sessionId}/play`).set(auth(s.sessionToken))).status).toBe(401);
      const res = await env.api.post(`/v2/sessions/${s.sessionId}/complete`).set(auth(s.sessionToken)).send({ log });
      expect(res.status).toBe(200);
    });

    it('results from test keys never reach leaderboards', async () => {
      const { key } = await setupApp(env, { mode: 'test' });
      expect(key).toMatch(/^sk_test_/);
      const s = await createSession(env, key);
      const { log } = await playMemory(env, s);
      const res = await env.api.post(`/v2/sessions/${s.sessionId}/complete`).set(auth(s.sessionToken)).send({ log });
      expect(res.body).toMatchObject({ status: 'verified', valid: false, rank: null });
    });
  });

  describe('leaderboards and stats', () => {
    it('ranks each player by their best verified score, per app and per chat', async () => {
      const { key } = await setupApp(env);
      const other = await setupApp(env, { name: 'Other app' });

      const playAs = async (k: string, externalUserId: string, mistakes: number, contextId?: string) => {
        const s = await createSession(env, k, { externalUserId, displayName: externalUserId, contextId });
        const { log } = await playMemory(env, s, mistakes);
        const res = await env.api.post(`/v2/sessions/${s.sessionId}/complete`).set(auth(s.sessionToken)).send({ log });
        expect(res.status).toBe(200);
        return res.body.score as number;
      };

      await playAs(key, 'amara', 3, 'group:1'); // lower score first…
      const amaraBest = await playAs(key, 'amara', 0, 'group:1'); // …best counts
      const bayo = await playAs(key, 'bayo', 2, 'group:1');
      const chidi = await playAs(key, 'chidi', 1, 'dm:7');
      await playAs(other.key, 'outsider', 0);

      const board = await env.api.get('/v2/leaderboards/game_memory_001').set(auth(key));
      expect(board.body.totalPlayers).toBe(3);
      expect(bayo).toBeLessThan(chidi); // every mistake costs, even before the first points
      expect(board.body.entries.map((e: { externalUserId: string; score: number; rank: number }) => [e.externalUserId, e.score, e.rank])).toEqual([
        ['amara', amaraBest, 1],
        ['chidi', chidi, 2],
        ['bayo', bayo, 3],
      ]);

      const group = await env.api.get('/v2/leaderboards/game_memory_001?contextId=group:1').set(auth(key));
      expect(group.body.entries.map((e: { externalUserId: string }) => e.externalUserId)).toEqual(['amara', 'bayo']);

      const page = await env.api.get('/v2/leaderboards/game_memory_001?limit=1&offset=1').set(auth(key));
      expect(page.body.entries.map((e: { externalUserId: string }) => e.externalUserId)).toEqual(['chidi']);
      expect(page.body.totalPlayers).toBe(3);

      const stats = await env.api.get('/v2/users/amara/stats').set(auth(key));
      expect(stats.body).toMatchObject({ gamesCompleted: 2, gamesPlayed: 2 });
      expect(stats.body.perGameStats.game_memory_001.highestScore).toBe(amaraBest);

      const leak = await env.api.get('/v2/users/amara/stats').set(auth(other.key));
      expect(leak.body.gamesCompleted).toBe(0);
    });
  });

  describe('quiz banks', () => {
    it('stores a bank and serves its questions to quiz sessions', async () => {
      const { key } = await setupApp(env);
      const questions = [
        { question: 'What does BRP stand for?', answer: 'Biometric Residence Permit', wrong: ['British Rail Pass', 'Border Return Paper'] },
        { question: 'Which exam tests English for visas?', answer: 'IELTS', wrong: ['GRE', 'SAT'] },
      ];
      expect((await env.api.put('/v2/quiz-banks/relocation').set(auth(key)).send({ name: 'Relocation', questions })).status).toBe(200);
      expect((await env.api.put('/v2/quiz-banks/bad').set(auth(key)).send({ questions: [{ question: 'x' }] })).status).toBe(400);

      const s = await createSession(env, key, { gameId: 'game_quiz_001', config: { bankId: 'relocation', questionCount: 5 } });
      const play = await env.api.get(`/v2/sessions/${s.sessionId}/play`).set(auth(s.sessionToken));
      const state = quizMasterRules.init(play.body.seed, play.body.config);
      expect(state.questions.map((q) => q.question).sort()).toEqual(questions.map((q) => q.question).sort());

      const missing = await env.api
        .post('/v2/sessions')
        .set(auth(key))
        .send({ gameId: 'game_quiz_001', externalUserId: 'u', config: { bankId: 'nope' } });
      expect(missing.status).toBe(400);
    });
  });

  describe('webhooks', () => {
    it('delivers a signed session.completed event and retries failures', async () => {
      const { dev, appId, key } = await setupApp(env);
      const hook = await env.api
        .put(`/portal/api/apps/${appId}/webhook`)
        .set(auth(dev.token))
        .send({ url: 'https://hooks.example.com/sage' });
      const secret: string = hook.body.secret;

      const s = await createSession(env, key, { contextId: 'group:1' });
      const { log } = await playMemory(env, s);
      await env.api.post(`/v2/sessions/${s.sessionId}/complete`).set(auth(s.sessionToken)).send({ log });

      // First attempt fails, then succeeds after the retry delay.
      const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
      let fail = true;
      const fakeFetch = async (url: string, init: { headers: Record<string, string>; body: string }) => {
        calls.push({ url, headers: init.headers, body: init.body });
        return { ok: !fail, status: fail ? 500 : 200 };
      };
      expect(await dispatchDue(env.ctx, fakeFetch as never)).toBe(1);
      expect(await dispatchDue(env.ctx, fakeFetch as never)).toBe(0); // not due yet
      fail = false;
      env.clock.advance(60_000);
      expect(await dispatchDue(env.ctx, fakeFetch as never)).toBe(1);

      const last = calls[calls.length - 1];
      expect(last.url).toBe('https://hooks.example.com/sage');
      expect(last.headers['Sage-Event']).toBe('session.completed');
      expect(verifyWebhookSignature(secret, last.body, last.headers['Sage-Signature'], Math.floor(env.clock.ms() / 1000))).toBe(true);
      expect(verifyWebhookSignature('whsec_wrong', last.body, last.headers['Sage-Signature'], Math.floor(env.clock.ms() / 1000))).toBe(false);
      expect(JSON.parse(last.body).data).toMatchObject({ sessionId: s.sessionId, contextId: 'group:1', valid: true });

      const status = await env.api.get(`/portal/api/apps/${appId}/webhook`).set(auth(dev.token));
      expect(status.body.recentDeliveries[0]).toMatchObject({ status: 'delivered', attempts: 2 });
    });
  });

  describe('v1 compatibility', () => {
    it('creates sessions with a bootstrap key but never ranks client-reported scores', async () => {
      const created = await env.api
        .post('/v1/sessions')
        .set(auth(env.bootstrapKey))
        .send({ gameId: 'game_quiz_001', externalUserId: 'u1', metadata: { name: 'Ada', email: 'ada@example.com' } });
      expect(created.status).toBe(201);
      expect(created.headers.deprecation).toBe('true');
      const { sessionId, sessionToken } = created.body;

      const asPlayer = await env.api.get(`/v1/sessions/${sessionId}`).set(auth(sessionToken));
      expect(asPlayer.body.metadata).toBeUndefined();
      const asHost = await env.api.get(`/v1/sessions/${sessionId}`).set(auth(env.bootstrapKey));
      expect(asHost.body.metadata).toEqual({ name: 'Ada', email: 'ada@example.com' });
      expect((await env.api.get(`/v1/sessions/${sessionId}`)).status).toBe(401);

      await env.api.post(`/v1/sessions/${sessionId}/start`).set(auth(sessionToken));
      env.clock.advance(5000);
      const done = await env.api
        .post(`/v1/sessions/${sessionId}/complete`)
        .set(auth(sessionToken))
        .send({ score: 99_999, duration: 3 });
      expect(done.status).toBe(200);
      expect((await env.api.post(`/v1/sessions/${sessionId}/complete`).set(auth(sessionToken)).send({ score: 1, duration: 1 })).status).toBe(409);

      const board = await env.api.get('/v1/games/game_quiz_001/leaderboard').set(auth(env.bootstrapKey));
      expect(board.body.entries).toEqual([]);
    });

    it('serves the public catalog', async () => {
      const res = await env.api.get('/v1/games?category=word');
      expect(res.body.map((g: { slug: string }) => g.slug).sort()).toEqual(['word-rush', 'word-search']);
    });
  });

  describe('http', () => {
    it('answers CORS preflights on the game API only', async () => {
      const pre = await env.api.options('/v2/sessions').set('Origin', 'https://app.example.com');
      expect(pre.status).toBe(204);
      expect(pre.headers['access-control-allow-origin']).toBe('*');
      const portal = await env.api.get('/portal/api/config').set('Origin', 'https://evil.example.com');
      expect(portal.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('serves the built portal as a single-page app', async () => {
      const path = await import('path');
      const fs = await import('fs');
      const portalDir = path.resolve(__dirname, '../../portal/dist');
      if (!fs.existsSync(path.join(portalDir, 'index.html'))) return; // portal not built in this run
      const { createApp } = await import('../src/app');
      const supertest = (await import('supertest')).default;
      const api = supertest(createApp(env.ctx, { portalDir }));
      const shell = await api.get('/portal/');
      expect(shell.status).toBe(200);
      expect(shell.text).toContain('<div id="root">');
      expect(shell.headers['content-security-policy']).toContain(env.config.supabaseUrl);
      expect((await api.get('/portal/apps/abc')).text).toContain('<div id="root">');
      expect((await api.get('/')).headers.location).toBe('/portal/');
    });

    it('returns JSON errors for bad input', async () => {
      const { key } = await setupApp(env);
      const res = await env.api.post('/v2/sessions').set(auth(key)).set('Content-Type', 'application/json').send('{bad');
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('invalid_json');
      expect((await env.api.get('/nope')).status).toBe(404);
    });
  });
});
