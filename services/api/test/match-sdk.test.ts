import http from 'http';
import { AddressInfo } from 'net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { MatchController, MatchSeat, WebSocketLike } from '@sagegames/core';
import { memoryMatchRules, MemoryMatchState } from '@sagegames/game-memory-match';
import { createApp } from '../src/app';
import { MatchHub } from '../src/realtime/MatchRoom';
import { attachRealtime } from '../src/realtime/wsServer';
import { createTestEnv, TestEnv } from './support/setup';

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(predicate: () => boolean, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timed out');
    await sleep(10);
  }
}

describe('SDK MatchController against the real server', () => {
  let env: TestEnv;
  let server: http.Server;
  let baseUrl: string;
  let apiKey: string;
  let realtime: { close(): Promise<void> };
  let api: TestEnv['api'];
  const controllers: MatchController[] = [];
  const sockets: WebSocket[] = [];

  beforeEach(async () => {
    env = await createTestEnv();
    env.ctx.now = () => new Date();
    const app = createApp(env.ctx, { realtime: { countdownMs: 100, graceMs: 2000, tickMs: 20, lingerMs: 2000 } });
    server = http.createServer(app);
    realtime = attachRealtime(server, env.ctx, app.locals.matchHub as MatchHub);
    await new Promise<void>((r) => server.listen(0, r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    api = (await import('supertest')).default(app) as unknown as TestEnv['api'];
    const dev = await env.signIn();
    const created = await api.post('/portal/api/apps').set(auth(dev.token)).send({ name: 'Japabudz' });
    apiKey = (await api.post(`/portal/api/apps/${created.body.id}/keys`).set(auth(dev.token)).send({})).body.key;
  });

  afterEach(async () => {
    controllers.splice(0).forEach((c) => c.dispose());
    sockets.splice(0);
    await realtime.close();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await env.db.close();
  });

  const controller = (seat: MatchSeat) => {
    const c = new MatchController({
      baseUrl,
      seat,
      resolveRules: (id) => (id === memoryMatchRules.gameId ? memoryMatchRules : undefined),
      createSocket: (url) => {
        const ws = new WebSocket(url);
        sockets.push(ws);
        return ws as unknown as WebSocketLike;
      },
      reconnectDelaysMs: [50, 100, 200],
    });
    controllers.push(c);
    return c;
  };

  /** What the host backend does: create the match and hand each player their seat. */
  const setupMatch = async () => {
    const m = await api
      .post('/v2/matches')
      .set(auth(apiKey))
      .send({ gameId: 'game_memory_001', players: [{ externalUserId: 'ada', displayName: 'Ada' }, { externalUserId: 'bayo', displayName: 'Bayo' }] });
    const seat = async (externalUserId: string): Promise<MatchSeat> => {
      const t = await api.post(`/v2/matches/${m.body.matchId}/tokens`).set(auth(apiKey)).send({ externalUserId });
      return { matchId: m.body.matchId, playerToken: t.body.playerToken };
    };
    return { ada: await seat('ada'), bayo: await seat('bayo') };
  };

  const pairs = (c: MatchController) => {
    const state = c.getSnapshot().runtime!.getSnapshot().state as MemoryMatchState;
    const map = new Map<string, number[]>();
    state.cards.forEach((card, i) => map.set(card.face, [...(map.get(card.face) ?? []), i]));
    return [...map.values()];
  };

  it('races two players from lobby to standings', async () => {
    const seats = await setupMatch();
    const [ada, bayo] = [controller(seats.ada), controller(seats.bayo)];
    await Promise.all([ada.connect(), bayo.connect()]);
    await until(() => ada.getSnapshot().phase === 'lobby' && bayo.getSnapshot().phase === 'lobby');
    expect(ada.getSnapshot().match!.players.map((p) => p.displayName)).toEqual(['Ada', 'Bayo']);

    ada.ready();
    bayo.ready();
    await until(() => ada.getSnapshot().phase === 'countdown');
    expect(ada.getSnapshot().startsAtLocal).toBeGreaterThan(Date.now() - 50);
    await until(() => ada.getSnapshot().phase === 'playing' && bayo.getSnapshot().phase === 'playing');

    // Moves are applied locally at once and streamed to the server.
    const deck = pairs(ada);
    for (const [x, y] of deck) {
      ada.getSnapshot().runtime!.dispatch('FLIP', { index: x });
      ada.getSnapshot().runtime!.dispatch('FLIP', { index: y });
      await sleep(5);
    }
    await until(() => ada.getSnapshot().phase === 'waiting');

    // Bayo sees Ada's progress live, then gives up.
    await until(() => bayo.getSnapshot().match!.players.find((p) => p.displayName === 'Ada')!.progress === 1);
    bayo.forfeit();

    await until(() => ada.getSnapshot().phase === 'finished' && bayo.getSnapshot().phase === 'finished');
    const standings = ada.getSnapshot().standings!;
    expect(standings.map((s) => [s.displayName, s.rank, s.score])).toEqual([
      ['Ada', 1, 900],
      ['Bayo', 2, 0],
    ]);
  });

  it('reconnects mid-race and keeps the board', async () => {
    const seats = await setupMatch();
    const [ada, bayo] = [controller(seats.ada), controller(seats.bayo)];
    await Promise.all([ada.connect(), bayo.connect()]);
    await until(() => ada.getSnapshot().phase === 'lobby' && bayo.getSnapshot().phase === 'lobby');
    ada.ready();
    bayo.ready();
    await until(() => ada.getSnapshot().phase === 'playing');

    const [[x, y]] = pairs(ada);
    ada.getSnapshot().runtime!.dispatch('FLIP', { index: x });
    ada.getSnapshot().runtime!.dispatch('FLIP', { index: y });
    await until(() => (bayo.getSnapshot().match!.players.find((p) => p.displayName === 'Ada')?.score ?? 0) > 0);

    // Drop Ada's connection (as if the network blipped).
    sockets[0].terminate();
    await until(() => ada.getSnapshot().reconnecting || !ada.getSnapshot().connected);
    await until(() => ada.getSnapshot().connected && ada.getSnapshot().phase === 'playing');

    const board = ada.getSnapshot().runtime!.getSnapshot().state as MemoryMatchState;
    expect(board.matchedPairs).toBe(1);
    expect(board.cards[x].matched).toBe(true);
  });
});
