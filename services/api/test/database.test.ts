/**
 * Database behaviour that must match on every dialect (run with SAGE_TEST_DB=sqlite|pglite|mysql|postgres).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dialectForUrl, json, sqlitePath } from '../src/db/db';
import { migrateToLatest, pendingMigrations } from '../src/db/migrate';
import { leaderboard, rankFor } from '../src/services/leaderboards';
import { createTenant } from '../src/services/tenants';
import { dispatchDue } from '../src/webhooks/dispatcher';
import { enqueueWebhook } from '../src/webhooks/outbox';
import { createTestEnv, TEST_DIALECT, TestEnv } from './support/setup';

describe(`database (${TEST_DIALECT})`, () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv();
  });
  afterEach(async () => {
    await env.close();
  });

  /** A verified result, written directly (the replay path is covered by the API tests). */
  async function result(tenantId: string, user: string, score: number, at: number, extra: { valid?: boolean; contextId?: string } = {}) {
    const id = `${user}_${score}_${at}`;
    const now = new Date(at);
    await env.db
      .insertInto('sagegames_game_sessions')
      .values({
        id: `sess_${id}`,
        tenant_id: tenantId,
        is_test: false,
        external_user_id: user,
        display_name: user.toUpperCase(),
        context_id: extra.contextId ?? null,
        game_id: 'game_memory_001',
        session_token_hash: `hash_${id}`,
        status: 'completed',
        seed: 'seed',
        rules_version: 1,
        resolved_config: json({}),
        metadata: json({}),
        expires_at: now,
        created_at: now,
      })
      .execute();
    await env.db
      .insertInto('sagegames_game_results')
      .values({
        id: `res_${id}`,
        session_id: `sess_${id}`,
        tenant_id: tenantId,
        game_id: 'game_memory_001',
        external_user_id: user,
        display_name: user.toUpperCase(),
        context_id: extra.contextId ?? null,
        status: 'verified',
        reject_code: null,
        score,
        duration_ms: 1000,
        result: json({ moves: 3 }),
        flags: json([]),
        is_valid: extra.valid ?? true,
        is_test: false,
        rules_version: 1,
        completed_at: now,
      })
      .execute();
  }

  it('ranks ties together, earlier achievers first, best score per player', async () => {
    const t = 'tenant_campus_app';
    const base = Date.UTC(2026, 8, 20);
    await result(t, 'ada', 500, base + 3000);
    await result(t, 'bo', 700, base + 2000);
    await result(t, 'cy', 500, base + 1000); // same score as ada, earlier
    await result(t, 'cy', 300, base + 500); // worse attempt: ignored
    await result(t, 'di', 500, base + 4000, { contextId: 'group:1' });
    await result(t, 'ed', 900, base + 100, { valid: false }); // never ranked

    const board = await leaderboard(env.db, { tenantId: t, gameId: 'game_memory_001' }, { limit: 10, offset: 0 }, env.clock.now());
    expect(board.totalPlayers).toBe(4);
    expect(board.entries.map((e) => [e.externalUserId, e.score, e.rank])).toEqual([
      ['bo', 700, 1],
      ['cy', 500, 2],
      ['ada', 500, 2],
      ['di', 500, 2],
    ]);
    expect(board.entries[1].achievedAt).toBe(new Date(base + 1000).toISOString());

    const page = await leaderboard(env.db, { tenantId: t, gameId: 'game_memory_001' }, { limit: 2, offset: 2 }, env.clock.now());
    expect(page.entries.map((e) => [e.externalUserId, e.rank])).toEqual([
      ['ada', 2],
      ['di', 2],
    ]);
    const empty = await leaderboard(env.db, { tenantId: t, gameId: 'game_memory_001' }, { limit: 2, offset: 10 }, env.clock.now());
    expect(empty).toMatchObject({ totalPlayers: 4, entries: [] });

    const group = await leaderboard(env.db, { tenantId: t, gameId: 'game_memory_001', contextId: 'group:1' }, { limit: 10, offset: 0 }, env.clock.now());
    expect(group.entries.map((e) => [e.externalUserId, e.rank])).toEqual([['di', 1]]);

    expect(await rankFor(env.db, { tenantId: t, gameId: 'game_memory_001', contextId: null, externalUserId: 'ada' })).toBe(2);
    expect(await rankFor(env.db, { tenantId: t, gameId: 'game_memory_001', contextId: null, externalUserId: 'ed' })).toBeNull();
  });

  it('claims each webhook delivery exactly once, even with dispatchers running at the same time', async () => {
    const now = env.clock.now();
    await createTenant(env.db, { id: 'hooked', name: 'Hooked', gameIds: [] }, now);
    await env.db.updateTable('sagegames_tenants').set({ webhook_url: 'https://hooks.example.com', webhook_secret: 'whsec_x' }).where('id', '=', 'hooked').execute();
    for (let i = 0; i < 45; i++) await enqueueWebhook(env.db, 'hooked', 'session.completed', { i }, now);

    const deliveries: string[] = [];
    const fetchImpl = async (_url: string, init: { headers: Record<string, string> }) => {
      deliveries.push(init.headers['Sage-Delivery']);
      await new Promise((r) => setTimeout(r, 5));
      return { ok: true, status: 200 };
    };
    // Three workers, three rounds: 45 deliveries, batches of 20.
    for (let round = 0; round < 3; round++) {
      await Promise.all([dispatchDue(env.ctx, fetchImpl as never), dispatchDue(env.ctx, fetchImpl as never), dispatchDue(env.ctx, fetchImpl as never)]);
    }
    expect(deliveries).toHaveLength(45);
    expect(new Set(deliveries).size).toBe(45);
    const left = await env.db.selectFrom('sagegames_webhook_deliveries').select('id').where('status', '<>', 'delivered').execute();
    expect(left).toEqual([]);
  });

  it('round-trips timestamps, booleans and JSON the same way everywhere', async () => {
    const at = new Date(Date.UTC(2026, 0, 2, 3, 4, 5, 678));
    await createTenant(env.db, { id: 't_types', name: 'Types', gameIds: ['game_quiz_001'] }, at);
    const tenant = await env.db.selectFrom('sagegames_tenants').selectAll().where('id', '=', 't_types').executeTakeFirstOrThrow();
    expect(tenant.created_at).toBeInstanceOf(Date);
    expect(tenant.created_at.toISOString()).toBe(at.toISOString());
    const access = await env.db.selectFrom('sagegames_tenant_game_access').selectAll().where('tenant_id', '=', 't_types').executeTakeFirstOrThrow();
    expect(access.is_enabled).toBe(true);
    expect(access.allowed_configurations).toEqual({});

    const questions = [{ q: 'Ünïcødé ✓ "quotes"', answers: [1, 2, 3] }];
    await env.db
      .insertInto('sagegames_quiz_banks')
      .values({ tenant_id: 't_types', bank_id: 'b1', name: 'B', questions: json(questions), created_by: null, updated_at: at })
      .execute();
    const bank = await env.db.selectFrom('sagegames_quiz_banks').selectAll().where('bank_id', '=', 'b1').executeTakeFirstOrThrow();
    expect(bank.questions).toEqual(questions);

    // Comparisons on timestamps work in SQL (SQLite stores ISO text).
    const later = await env.db.selectFrom('sagegames_tenants').select('id').where('created_at', '>', new Date(at.getTime() - 1)).where('id', '=', 't_types').execute();
    expect(later).toHaveLength(1);
  });

  it('applies migrations once', async () => {
    expect(await pendingMigrations(env.db)).toEqual([]);
    expect(await migrateToLatest(env.db)).toEqual([]);
    expect(await Promise.all([migrateToLatest(env.db), migrateToLatest(env.db)])).toEqual([[], []]);
  });

  it('cascades app deletion to everything the app owns', async () => {
    const t = 'tenant_campus_app';
    await result(t, 'ada', 500, Date.UTC(2026, 8, 20));
    await env.db.deleteFrom('sagegames_tenants').where('id', '=', t).execute();
    const rows = await env.db.selectFrom('sagegames_game_results').select('id').execute();
    expect(rows).toEqual([]);
  });
});

describe('database URLs', () => {
  it('picks the dialect from the scheme', () => {
    expect(dialectForUrl('postgres://u:p@h/db')).toBe('postgres');
    expect(dialectForUrl('postgresql://u:p@h/db')).toBe('postgres');
    expect(dialectForUrl('mysql://u:p@h/db')).toBe('mysql');
    expect(dialectForUrl('mariadb://u:p@h/db')).toBe('mysql');
    expect(dialectForUrl('sqlite:./data/sagegames.db')).toBe('sqlite');
    expect(dialectForUrl('file:/var/lib/sagegames.db')).toBe('sqlite');
    expect(() => dialectForUrl('mongodb://x')).toThrow(/Unsupported DATABASE_URL/);
  });

  it('reads SQLite paths', () => {
    expect(sqlitePath('sqlite:./data/sagegames.db')).toBe('./data/sagegames.db');
    expect(sqlitePath('sqlite:///var/data/sagegames.db')).toBe('/var/data/sagegames.db');
    expect(sqlitePath('file:./x.db')).toBe('./x.db');
    expect(sqlitePath('sqlite::memory:')).toBe(':memory:');
  });
});
