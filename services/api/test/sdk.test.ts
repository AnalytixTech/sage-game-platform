import http from 'http';
import { AddressInfo } from 'net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGameRules, SessionCredentials } from '@sagegames/types';
import { LauncherEvent, PendingStore, SageGameClient, SessionController } from '@sagegames/core';
import { memoryMatchRules, MemoryMatchState } from '@sagegames/game-memory-match';
import { quizMasterRules } from '@sagegames/game-quiz-master';
import { createApp } from '../src/app';
import { createTestEnv, TestEnv } from './support/setup';

const RULES: Record<string, AnyGameRules> = {
  [memoryMatchRules.gameId]: memoryMatchRules,
  [quizMasterRules.gameId]: quizMasterRules,
};

/** In-memory PendingStore (stands in for AsyncStorage). */
function memoryStore(): PendingStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('SDK SessionController against the real API', () => {
  let env: TestEnv;
  let server: http.Server;
  let baseUrl: string;
  let apiKey: string;

  beforeEach(async () => {
    env = await createTestEnv();
    server = http.createServer(createApp(env.ctx));
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const dev = await env.signIn();
    const app = await env.api.post('/portal/api/apps').set({ Authorization: `Bearer ${dev.token}` }).send({ name: 'Japabudz' });
    apiKey = (await env.api.post(`/portal/api/apps/${app.body.id}/keys`).set({ Authorization: `Bearer ${dev.token}` }).send({})).body.key;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await env.db.close();
  });

  /** What a host backend endpoint does: create a session with the API key. */
  const hostCreatesSession = async (gameId = memoryMatchRules.gameId): Promise<SessionCredentials> => {
    const res = await fetch(`${baseUrl}/v2/sessions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId, externalUserId: 'user_1', displayName: 'Ada', contextId: 'group:1' }),
    });
    return res.json();
  };

  const playPerfectMemory = (controller: SessionController) => {
    const runtime = controller.getSnapshot().runtime!;
    const state = runtime.getSnapshot().state as MemoryMatchState;
    const pairs = new Map<string, number[]>();
    state.cards.forEach((c, i) => pairs.set(c.face, [...(pairs.get(c.face) ?? []), i]));
    for (const [a, b] of pairs.values()) {
      env.clock.advance(700);
      runtime.dispatch('FLIP', { index: a });
      env.clock.advance(700);
      runtime.dispatch('FLIP', { index: b });
    }
  };

  const waitFor = async (predicate: () => boolean) => {
    for (let i = 0; i < 200 && !predicate(); i++) await new Promise((r) => setTimeout(r, 5));
    expect(predicate()).toBe(true);
  };

  it('plays a game end to end and reports the verified result once', async () => {
    const events: LauncherEvent[] = [];
    const completions: unknown[] = [];
    const controller = new SessionController({
      client: new SageGameClient({ baseUrl }),
      resolveRules: (id) => RULES[id],
      getSession: () => hostCreatesSession(),
      now: env.clock.ms,
      onEvent: (e) => {
        events.push(e);
        if (e.type === 'completed') completions.push(e.result);
      },
    });

    await controller.load();
    expect(controller.getSnapshot().phase).toBe('ready');
    await controller.begin();
    expect(controller.getSnapshot().phase).toBe('playing');

    playPerfectMemory(controller);
    await waitFor(() => controller.getSnapshot().phase === 'result');

    const { result } = controller.getSnapshot();
    expect(result).toMatchObject({ status: 'verified', valid: true, score: 900, rank: 1 });
    expect(completions).toHaveLength(1);
    expect(events.map((e) => e.type)).toEqual(['loaded', 'started', 'ended', 'completed']);

    // Play again asks the host for a fresh session.
    await controller.playAgain();
    expect(controller.getSnapshot().phase).toBe('ready');
    expect(controller.getSnapshot().play!.sessionId).not.toBe(result!.sessionId);
  });

  it('keeps an unsent result across an app restart and submits it on the next load', async () => {
    const creds = await hostCreatesSession();
    const store = memoryStore();
    let online = true;
    const flakyFetch: typeof fetch = (input, init) =>
      online ? fetch(input, init) : Promise.reject(new TypeError('Network request failed'));

    const first = new SessionController({
      client: new SageGameClient({ baseUrl, fetch: flakyFetch }),
      resolveRules: (id) => RULES[id],
      session: creds,
      pendingStore: store,
      now: env.clock.ms,
      retryDelaysMs: [1, 1],
    });
    await first.load();
    await first.begin();
    online = false; // connection drops before the game ends
    playPerfectMemory(first);
    await waitFor(() => first.getSnapshot().phase === 'error');
    expect(first.getSnapshot().error).toMatchObject({ during: 'submit', retryable: true, code: 'network_error' });
    expect(store.data.size).toBe(1);
    first.dispose(); // app closed

    online = true;
    const second = new SessionController({
      client: new SageGameClient({ baseUrl }),
      resolveRules: (id) => RULES[id],
      session: creds,
      pendingStore: store,
      now: env.clock.ms,
    });
    await second.load();
    await waitFor(() => second.getSnapshot().phase === 'result');
    expect(second.getSnapshot().result).toMatchObject({ status: 'verified', score: 900 });
    expect(store.data.size).toBe(0);
  });

  it('retries a failed submission and succeeds', async () => {
    let failures = 2;
    const flaky: typeof fetch = (input, init) => {
      if (String(input).endsWith('/complete') && failures-- > 0) {
        return Promise.resolve(new Response(JSON.stringify({ error: 'Bad gateway' }), { status: 502 }));
      }
      return fetch(input, init);
    };
    const controller = new SessionController({
      client: new SageGameClient({ baseUrl, fetch: flaky }),
      resolveRules: (id) => RULES[id],
      getSession: () => hostCreatesSession(),
      now: env.clock.ms,
      retryDelaysMs: [1, 1, 1],
    });
    await controller.load();
    await controller.begin();
    playPerfectMemory(controller);
    await waitFor(() => controller.getSnapshot().phase === 'result');
    expect(controller.getSnapshot().result!.valid).toBe(true);
  });

  it('asks for an SDK update when the server runs newer rules', async () => {
    const outdated = { ...memoryMatchRules, rulesVersion: 0 };
    const controller = new SessionController({
      client: new SageGameClient({ baseUrl }),
      resolveRules: () => outdated,
      getSession: () => hostCreatesSession(),
    });
    await controller.load();
    expect(controller.getSnapshot().error).toMatchObject({ code: 'sdk_update_required', retryable: false });
  });

  it('refuses a session that was already played', async () => {
    const creds = await hostCreatesSession();
    const make = () =>
      new SessionController({ client: new SageGameClient({ baseUrl }), resolveRules: (id) => RULES[id], session: creds, now: env.clock.ms });
    const first = make();
    await first.load();
    await first.begin();
    first.quit();
    await waitFor(() => first.getSnapshot().phase === 'result');

    const second = make();
    await second.load();
    expect(second.getSnapshot().error?.code).toBe('already_completed');
  });

  it('surfaces a quiz timeout as a completed game when the timer runs out', async () => {
    const controller = new SessionController({
      client: new SageGameClient({ baseUrl }),
      resolveRules: (id) => RULES[id],
      getSession: () => hostCreatesSession(quizMasterRules.gameId),
      now: env.clock.ms,
    });
    await controller.load();
    await controller.begin();
    env.clock.advance(10 * 20_000 + 1000); // every question times out
    controller.tick();
    await waitFor(() => controller.getSnapshot().phase === 'result');
    expect(controller.getSnapshot().result).toMatchObject({ status: 'verified', score: 0 });
  });
});
