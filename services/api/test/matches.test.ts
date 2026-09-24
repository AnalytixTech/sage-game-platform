import http from 'http';
import { AddressInfo } from 'net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { ServerMessage, WelcomeMessage } from '@sagegames/types';
import { memoryMatchRules, MemoryMatchState } from '@sagegames/game-memory-match';
import { createApp } from '../src/app';
import { attachRealtime } from '../src/realtime/wsServer';
import { computeStandings, MatchHub } from '../src/realtime/MatchRoom';
import { createTestEnv, TestEnv } from './support/setup';

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A test player: a WebSocket that records every server message. */
class Player {
  messages: ServerMessage[] = [];
  ws: WebSocket;
  opened: Promise<void>;
  closed = false;
  private seq = 0;
  private startAt = 0;

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.opened = new Promise((resolve) => this.ws.on('open', () => resolve()));
    this.ws.on('message', (d) => {
      const msg = JSON.parse(d.toString()) as ServerMessage;
      if (msg.type === 'started' || msg.type === 'countdown') this.startAt = msg.startAt;
      this.messages.push(msg);
    });
    this.ws.on('close', () => (this.closed = true));
  }

  send(msg: unknown) {
    this.ws.send(JSON.stringify(msg));
  }

  async join(token: string): Promise<WelcomeMessage> {
    await this.opened;
    this.send({ type: 'auth', token });
    return (await this.next('welcome')) as WelcomeMessage;
  }

  act(type: string, payload?: unknown, t?: number) {
    this.send({ type: 'action', seq: ++this.seq, t: t ?? Math.max(0, Date.now() - this.startAt), a: [type, payload] });
    return this.seq;
  }

  async next<T extends ServerMessage['type']>(type: T, predicate: (m: Extract<ServerMessage, { type: T }>) => boolean = () => true, timeoutMs = 4000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = this.messages.find((m) => m.type === type && predicate(m as Extract<ServerMessage, { type: T }>));
      if (found) return found as Extract<ServerMessage, { type: T }>;
      await sleep(10);
    }
    throw new Error(`Timed out waiting for ${type}; got ${this.messages.map((m) => m.type).join(',')}`);
  }

  close() {
    this.ws.close();
  }
}

/** Card index pairs for a memory deck. */
const pairsOf = (seed: string, config: Record<string, unknown>) => {
  const state = memoryMatchRules.init(seed, memoryMatchRules.parseConfig(config)) as MemoryMatchState;
  const pairs = new Map<string, number[]>();
  state.cards.forEach((c, i) => pairs.set(c.face, [...(pairs.get(c.face) ?? []), i]));
  return [...pairs.values()];
};

describe('online battles', () => {
  let env: TestEnv;
  let server: http.Server;
  let wsUrl: string;
  let apiKey: string;
  let realtime: { close(): Promise<void> };
  let api: TestEnv['api'];
  const players: Player[] = [];

  beforeEach(async () => {
    env = await createTestEnv();
    env.ctx.now = () => new Date(); // real time: rooms run real timers
    const app = createApp(env.ctx, { realtime: { countdownMs: 60, graceMs: 300, tickMs: 20, lingerMs: 2000 } });
    server = http.createServer(app);
    realtime = attachRealtime(server, env.ctx, app.locals.matchHub as MatchHub);
    await new Promise<void>((r) => server.listen(0, r));
    wsUrl = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/v2/ws`;
    api = (await import('supertest')).default(app) as unknown as TestEnv['api'];

    const dev = await env.signIn();
    const created = await api.post('/portal/api/apps').set(auth(dev.token)).send({ name: 'Japabudz' });
    apiKey = (await api.post(`/portal/api/apps/${created.body.id}/keys`).set(auth(dev.token)).send({})).body.key;
  });

  afterEach(async () => {
    players.splice(0).forEach((p) => p.close());
    await realtime.close();
    server.closeAllConnections(); // upgraded WebSocket sockets would otherwise keep close() waiting
    await new Promise((r) => server.close(r));
    await env.db.close(); // each test gets its own in-memory Postgres
  });

  const player = () => {
    const p = new Player(wsUrl);
    players.push(p);
    return p;
  };

  const createMatch = async (body: Record<string, unknown>) => {
    const res = await api.post('/v2/matches').set(auth(apiKey)).send({ gameId: 'game_memory_001', ...body });
    expect(res.status).toBe(201);
    return res.body as { matchId: string; players: { externalUserId: string }[] };
  };

  /** The deck, from the database: players never receive the seed of a hidden-information game. */
  const deckOf = async (matchId: string) => {
    const [row] = await env.db.query<{ seed: string; resolved_config: Record<string, unknown> }>(
      'SELECT seed, resolved_config FROM matches WHERE id = $1',
      [matchId]
    );
    return pairsOf(row.seed, row.resolved_config);
  };

  const tokenFor = async (matchId: string, externalUserId: string) => {
    const res = await api.post(`/v2/matches/${matchId}/tokens`).set(auth(apiKey)).send({ externalUserId });
    expect(res.status).toBe(201);
    return res.body.playerToken as string;
  };

  it('runs a DM race from lobby to verified standings', async () => {
    const match = await createMatch({
      players: [{ externalUserId: 'ada', displayName: 'Ada' }, { externalUserId: 'bayo', displayName: 'Bayo' }],
      contextId: 'dm:1',
    });
    const [a, b] = [player(), player()];
    const wa = await a.join(await tokenFor(match.matchId, 'ada'));
    await b.join(await tokenFor(match.matchId, 'bayo'));
    expect(wa.match.players.map((p) => p.externalUserId)).toEqual(['ada', 'bayo']);
    // Memory hides card faces: no seed or config reaches the players.
    expect(wa.play).toEqual({ gameId: 'game_memory_001', rulesVersion: 1, hidden: true });

    a.send({ type: 'ready' });
    b.send({ type: 'ready' });
    await a.next('countdown');
    await a.next('started');
    const first = await a.next('state');
    expect((first.state as MemoryMatchState).cards.every((c) => c.face === '')).toBe(true);

    // Ada solves the deck; Bayo finds two pairs and gives up.
    const pairs = await deckOf(match.matchId);
    for (const [x, y] of pairs) {
      a.act('FLIP', { index: x });
      a.act('FLIP', { index: y });
      await sleep(5);
    }
    for (const [x, y] of pairs.slice(0, 2)) {
      b.act('FLIP', { index: x });
      b.act('FLIP', { index: y });
    }
    await b.next('ack', (m) => m.seq === 4);
    b.send({ type: 'forfeit' });

    const { standings } = await a.next('finished');
    expect(standings.map((s) => [s.externalUserId, s.rank, s.completed, s.status])).toEqual([
      ['ada', 1, true, 'finished'],
      ['bayo', 2, false, 'forfeited'],
    ]);
    expect(standings[0].score).toBe(900);
    expect(standings[1].score).toBe(300);
    await b.next('finished');

    // Stored like solo games, plus the match record and webhook.
    await sleep(50);
    const results = await env.db.query<{ external_user_id: string; status: string; score: number }>(
      'SELECT external_user_id, status, score FROM game_results ORDER BY external_user_id'
    );
    expect(results).toEqual([
      { external_user_id: 'ada', status: 'verified', score: 900 },
      { external_user_id: 'bayo', status: 'verified', score: 300 },
    ]);
    const view = await api.get(`/v2/matches/${match.matchId}`).set(auth(apiKey));
    expect(view.body.status).toBe('finished');
    expect(view.body.standings[0].externalUserId).toBe('ada');
    const hooks = await env.db.query<{ event_type: string }>('SELECT event_type FROM webhook_deliveries');
    expect(hooks).toEqual([]); // no webhook URL configured for this app
  });

  it('lets group members join an open lobby and see each other', async () => {
    const match = await createMatch({ players: [{ externalUserId: 'host', displayName: 'Host' }], allowJoin: true, maxPlayers: 3 });
    const a = player();
    await a.join(await tokenFor(match.matchId, 'host'));

    const joined = await api.post(`/v2/matches/${match.matchId}/players`).set(auth(apiKey)).send({ externalUserId: 'chidi', displayName: 'Chidi' });
    expect(joined.status).toBe(201);
    await a.next('match', (m) => m.match.players.length === 2);

    const b = player();
    const wb = await b.join(joined.body.playerToken);
    expect(wb.you).toBe(joined.body.playerId);

    await api.post(`/v2/matches/${match.matchId}/players`).set(auth(apiKey)).send({ externalUserId: 'dayo' });
    const full = await api.post(`/v2/matches/${match.matchId}/players`).set(auth(apiKey)).send({ externalUserId: 'emeka' });
    expect(full.body.code).toBe('match_full');
  });

  it('refuses joins on invite-only matches', async () => {
    const match = await createMatch({ players: [{ externalUserId: 'a' }, { externalUserId: 'b' }] });
    const res = await api.post(`/v2/matches/${match.matchId}/players`).set(auth(apiKey)).send({ externalUserId: 'intruder' });
    expect(res.body.code).toBe('invite_only');
  });

  it('cancels a lobby that times out without enough ready players', async () => {
    const match = await createMatch({ players: [{ externalUserId: 'a' }, { externalUserId: 'b' }] });
    await env.db.query(`UPDATE matches SET lobby_expires_at = now() + interval '200 milliseconds' WHERE id = $1`, [match.matchId]);
    const a = player();
    await a.join(await tokenFor(match.matchId, 'a'));
    a.send({ type: 'ready' });
    await a.next('match', (m) => m.match.status === 'cancelled', 3000);
  });

  it('forfeits a player who stays disconnected past the grace period', async () => {
    const match = await createMatch({ players: [{ externalUserId: 'a' }, { externalUserId: 'b' }] });
    const [a, b] = [player(), player()];
    await a.join(await tokenFor(match.matchId, 'a'));
    await b.join(await tokenFor(match.matchId, 'b'));
    a.send({ type: 'ready' });
    b.send({ type: 'ready' });
    await a.next('started');
    b.close();
    await a.next('progress', (m) => m.players.some((p) => p.status === 'forfeited'), 3000);
    a.send({ type: 'forfeit' });
    const { standings } = await a.next('finished');
    expect(standings.map((s) => s.status)).toEqual(['forfeited', 'forfeited']);
  });

  it('restores your moves when you reconnect mid-race', async () => {
    const match = await createMatch({ players: [{ externalUserId: 'a' }, { externalUserId: 'b' }] });
    const tokenA = await tokenFor(match.matchId, 'a');
    const [a, b] = [player(), player()];
    await a.join(tokenA);
    await b.join(await tokenFor(match.matchId, 'b'));
    a.send({ type: 'ready' });
    b.send({ type: 'ready' });
    await a.next('started');
    const [[x, y]] = await deckOf(match.matchId);
    a.act('FLIP', { index: x });
    a.act('FLIP', { index: y });
    await a.next('ack', (m) => m.seq === 2);
    a.close();

    // Hidden-information games resume from the server's view of the board.
    const again = player();
    const back = await again.join(tokenA);
    expect(back.match.status).toBe('in_progress');
    const board = back.state as MemoryMatchState;
    expect(board.matchedPairs).toBe(1);
    expect(board.cards.filter((c) => c.face !== '').length).toBe(2);
  });

  it('never lets a player claim a move in the future or pause the race', async () => {
    const match = await createMatch({ players: [{ externalUserId: 'a' }, { externalUserId: 'b' }] });
    const [a, b] = [player(), player()];
    await a.join(await tokenFor(match.matchId, 'a'));
    await b.join(await tokenFor(match.matchId, 'b'));

    const early = a.act('FLIP', { index: 0 });
    expect((await a.next('reject', (m) => m.seq === early)).code).toBe('not_playing');

    a.send({ type: 'ready' });
    b.send({ type: 'ready' });
    await a.next('started');
    const future = a.act('FLIP', { index: (await deckOf(match.matchId))[0][0] }, 10 * 60_000);
    const ack = await a.next('ack', (m) => m.seq === future);
    expect(ack.t).toBeLessThan(5000); // clamped to the server's race clock

    const pause = a.act('$pause');
    expect((await a.next('reject', (m) => m.seq === pause)).code).toBe('pause_not_allowed');
    const junk = a.act('WIN');
    expect((await a.next('reject', (m) => m.seq === junk)).code).toBe('invalid');
  });

  const race = async (body: Record<string, unknown>) => {
    const match = await createMatch({ players: [{ externalUserId: 'a' }, { externalUserId: 'b' }], ...body });
    const [a, b] = [player(), player()];
    const welcome = await a.join(await tokenFor(match.matchId, 'a'));
    await b.join(await tokenFor(match.matchId, 'b'));
    a.send({ type: 'ready' });
    b.send({ type: 'ready' });
    await a.next('started');
    return { match, a, b, welcome };
  };

  it('memory: a card face reaches the player only when it is flipped', async () => {
    const { match, a, b } = await race({});
    const [[x, y], [z]] = await deckOf(match.matchId);
    await a.next('state');
    const seq = a.act('FLIP', { index: z });
    await a.next('ack', (m) => m.seq === seq);
    const after = (await a.next('state', (m) => (m.state as MemoryMatchState).revealed.length === 1)).state as MemoryMatchState;
    expect(after.cards.filter((c) => c.face !== '').map((c) => c.face)).toHaveLength(1);
    expect(after.cards[z].face).not.toBe('');
    expect(after.cards[x].face).toBe('');
    expect(after.cards[y].face).toBe('');

    // Nothing Bayo receives carries Ada's board.
    await sleep(50);
    expect(b.messages.filter((m) => m.type === 'state').every((m) => (m.state as MemoryMatchState).cards.every((c) => c.face === ''))).toBe(true);
  });

  it('quiz: answers (including custom ones) are never sent before the question is answered', async () => {
    const questions = [
      { question: 'What does BRP stand for?', answer: 'Biometric Residence Permit', wrong: ['British Rail Pass', 'Border Return Paper'] },
      { question: 'What is an IHS?', answer: 'Immigration Health Surcharge', wrong: ['Internal Home Survey', 'Initial Housing Scheme'] },
      { question: 'What is a CAS?', answer: 'Confirmation of Acceptance for Studies', wrong: ['Certified Academic Score', 'Campus Access Slip'] },
    ];
    const { a, welcome } = await race({ gameId: 'game_quiz_001', config: { questions, questionCount: 3 } });
    expect(welcome.play.config).toBeUndefined();
    const everythingA = () => JSON.stringify(a.messages);

    const first = (await a.next('state')).state as { questions: { question: string; options: string[]; correctIndex: number }[]; index: number };
    expect(first.questions[0].correctIndex).toBe(-1);
    expect(first.questions.slice(1).every((q) => q.question === '' && q.options.length === 0)).toBe(true);
    // The two answers still to come appear nowhere in what Ada has received.
    const current = first.questions[0].question;
    const later = questions.filter((q) => q.question !== current);
    for (const q of later) expect(everythingA()).not.toContain(q.answer);

    const seq = a.act('ANSWER', { qIndex: 0, choice: 0 });
    await a.next('ack', (m) => m.seq === seq);
    const next = (await a.next('state', (m) => (m.state as { index: number }).index === 1)).state as typeof first;
    expect(next.questions[0].correctIndex).toBeGreaterThanOrEqual(0); // revealed after answering
    expect(next.questions[1].question).not.toBe('');
    expect(next.questions[1].correctIndex).toBe(-1);
  });

  it('open-information games still get the seed and resume from the moves', async () => {
    const { welcome } = await race({ gameId: 'game_sudoku_001', config: { variant: '4x4' } });
    expect(welcome.play.hidden).toBe(false);
    expect(welcome.play.seed).toMatch(/^[0-9a-f]{32}$/);
    expect(welcome.play.config).toMatchObject({ variant: '4x4' });
    expect(welcome.state).toBeUndefined();
  });

  it('rejects bad tokens and solo session tokens', async () => {
    const bad = player();
    await bad.opened;
    bad.send({ type: 'auth', token: 'stk_nope' });
    expect((await bad.next('error')).code).toBe('invalid_token');

    const solo = await api.post('/v2/sessions').set(auth(apiKey)).send({ gameId: 'game_memory_001', externalUserId: 'z' });
    const s = player();
    await s.opened;
    s.send({ type: 'auth', token: solo.body.sessionToken });
    expect((await s.next('error')).code).toBe('invalid_token');
  });

  it("keeps each app's matches private", async () => {
    const match = await createMatch({ players: [{ externalUserId: 'a' }, { externalUserId: 'b' }] });
    const dev = await env.signIn();
    const other = await api.post('/portal/api/apps').set(auth(dev.token)).send({ name: 'Other' });
    const otherKey = (await api.post(`/portal/api/apps/${other.body.id}/keys`).set(auth(dev.token)).send({})).body.key;
    expect((await api.get(`/v2/matches/${match.matchId}`).set(auth(otherKey))).status).toBe(404);
    expect((await api.post(`/v2/matches/${match.matchId}/tokens`).set(auth(otherKey)).send({ externalUserId: 'a' })).status).toBe(404);
  });

  it('match seats cannot be completed through the solo endpoints', async () => {
    const match = await createMatch({ players: [{ externalUserId: 'a' }, { externalUserId: 'b' }] });
    const token = await tokenFor(match.matchId, 'a');
    const view = await api.get(`/v2/matches/${match.matchId}`).set(auth(apiKey));
    const seat = view.body.players[0].playerId;
    const res = await api.post(`/v2/sessions/${seat}/start`).set(auth(token)).send({});
    expect(res.body.code).toBe('match_session');
  });
});

describe('race standings', () => {
  const p = (id: string, o: Partial<Parameters<typeof computeStandings>[1][number]>) => ({
    playerId: id,
    externalUserId: id,
    displayName: id,
    status: 'finished' as const,
    score: 0,
    progress: 0,
    completed: false,
    finishedMs: null,
    ...o,
  });

  it('time_then_score: finishers by time, then the rest by score, forfeits last', () => {
    const s = computeStandings('time_then_score', [
      p('slow', { completed: true, finishedMs: 9000, score: 900 }),
      p('fast', { completed: true, finishedMs: 5000, score: 700 }),
      p('partial', { score: 400, progress: 0.5 }),
      p('quitter', { status: 'forfeited', score: 800 }),
      p('absent', { status: 'absent' }),
    ]);
    expect(s.map((x) => x.playerId)).toEqual(['fast', 'slow', 'partial', 'quitter']);
    expect(s.map((x) => x.rank)).toEqual([1, 2, 3, 4]);
  });

  it('score_then_time: highest score wins, earlier finish breaks ties', () => {
    const s = computeStandings('score_then_time', [
      p('a', { score: 500, finishedMs: 9000 }),
      p('b', { score: 500, finishedMs: 7000 }),
      p('c', { score: 800, finishedMs: 12000 }),
    ]);
    expect(s.map((x) => x.playerId)).toEqual(['c', 'b', 'a']);
  });
});
