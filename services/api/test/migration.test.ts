/**
 * Moving a 2.x deployment: export from the old Postgres schema, import into a fresh 3.0 database
 * (whichever dialect SAGE_TEST_DB picks), and existing API keys keep working.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashKeySecret } from '../src/auth/keys';
import { exportLegacy } from '../src/scripts/export-supabase';
import { importExport } from '../src/scripts/import';
import { createTestEnv, TEST_DIALECT, TestEnv } from './support/setup';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const KEY_ID = '0123456789abcdef';
const KEY_SECRET = 'ab'.repeat(24);
const API_KEY = `sk_live_${KEY_ID}_${KEY_SECRET}`;
const OWNER_ID = '7d4d2c1e-2f43-4b5f-9a43-1f2e3d4c5b6a';

async function legacyDeployment(pepper: string): Promise<PGlite> {
  const pg = await PGlite.create();
  await pg.exec(fs.readFileSync(path.join(__dirname, 'fixtures/legacy-v2-schema.sql'), 'utf8'));
  await pg.query(`INSERT INTO auth.users (id, email, email_confirmed_at, created_at) VALUES ($1, 'Owner@Example.com', now(), now()), (gen_random_uuid(), 'stranger@example.com', now(), now())`, [OWNER_ID]);
  await pg.exec(`
    SET search_path TO sagegames;
    INSERT INTO tenants (id, name, webhook_url, webhook_secret) VALUES ('app_japabudz', 'Japabudz', 'https://hooks.example.com/sage', 'whsec_old');
    INSERT INTO games (id, slug, name, version, category, rules_version) VALUES ('game_memory_001', 'memory-match', 'Memory Match', '2.0.0', 'memory', 1);
    INSERT INTO tenant_game_access (tenant_id, game_id, is_enabled, allowed_configurations) VALUES ('app_japabudz', 'game_memory_001', TRUE, '{"pairCount": 6}');
    INSERT INTO game_sessions (id, tenant_id, external_user_id, display_name, context_id, game_id, session_token_hash, status, seed, rules_version, resolved_config, expires_at, completed_at)
      VALUES ('sess_old', 'app_japabudz', 'amara', 'Amara', 'group:1', 'game_memory_001', 'hash_old', 'completed', 'seed', 1, '{"pairCount": 6}', now(), now());
    INSERT INTO session_logs (session_id, log, log_sha256) VALUES ('sess_old', '{"actions": []}', 'abc');
    INSERT INTO game_results (id, session_id, tenant_id, game_id, external_user_id, display_name, context_id, status, score, duration_ms, result, flags, is_valid, rules_version)
      VALUES ('res_old', 'sess_old', 'app_japabudz', 'game_memory_001', 'amara', 'Amara', 'group:1', 'verified', 900, 12000, '{"moves": 6}', '[]', TRUE, 1);
    INSERT INTO player_stats (tenant_id, external_user_id, game_id, games_completed, total_score, highest_score, total_play_time_ms) VALUES ('app_japabudz', 'amara', 'game_memory_001', 1, 900, 900, 12000);
    INSERT INTO quiz_banks (tenant_id, bank_id, name, questions) VALUES ('app_japabudz', 'visa', 'Visa basics', '[{"question": "Q?", "correct": "A", "wrong": ["B", "C", "D"]}]');
    INSERT INTO webhook_deliveries (tenant_id, event_type, payload, status, attempts) VALUES ('app_japabudz', 'session.completed', '{"sessionId": "sess_old"}', 'delivered', 1);
  `);
  await pg.query(`INSERT INTO sagegames.tenant_members (tenant_id, user_id, role) VALUES ('app_japabudz', $1, 'owner')`, [OWNER_ID]);
  await pg.query(`INSERT INTO sagegames.api_keys (id, tenant_id, mode, key_hash, label, created_by) VALUES ($1, 'app_japabudz', 'live', $2, 'server', $3)`, [
    KEY_ID,
    hashKeySecret(KEY_SECRET, pepper),
    OWNER_ID,
  ]);
  return pg;
}

describe(`moving a 2.x deployment (into ${TEST_DIALECT})`, () => {
  let env: TestEnv;
  let file: string;
  beforeEach(async () => {
    env = await createTestEnv();
    file = path.join(os.tmpdir(), `sagegames-export-${process.pid}-${Date.now()}.ndjson`);
  });
  afterEach(async () => {
    await env.close();
    fs.rmSync(file, { force: true });
  });

  it('exports the old schema and imports it; keys, results, banks and accounts carry over', async () => {
    const legacy = await legacyDeployment(env.config.apiKeyPepper);
    const lines: string[] = [];
    const counts = await exportLegacy((text, params) => legacy.query(text, params) as never, (line) => lines.push(line));
    await legacy.close();
    expect(counts).toMatchObject({ users: 1, tenants: 1, api_keys: 1, game_results: 1, quiz_banks: 1, webhook_deliveries: 1 }); // the stranger isn't exported
    fs.writeFileSync(file, lines.join('\n') + '\n');

    // A fresh database: only the code catalog (the test env's bootstrap app is removed).
    await env.db.deleteFrom('sagegames_tenants').execute();
    const summary = await importExport(env.db, file);
    expect(summary.counts).toMatchObject({ users: 1, tenants: 1, game_sessions: 1, game_results: 1 });

    // The old API key still works (same pepper).
    const session = await env.api.post('/v2/sessions').set(auth(API_KEY)).send({ gameId: 'game_memory_001', externalUserId: 'bayo' });
    expect(session.status).toBe(201);
    const board = await env.api.get('/v2/leaderboards/game_memory_001').set(auth(API_KEY));
    expect(board.body.entries).toEqual([expect.objectContaining({ externalUserId: 'amara', score: 900, rank: 1 })]);
    const banks = await env.api.get('/v2/quiz-banks').set(auth(API_KEY));
    expect(banks.body).toEqual([expect.objectContaining({ bankId: 'visa', name: 'Visa basics', questionCount: 1 })]);

    // The owner sets a password by email on first sign-in, then sees their app.
    const first = await env.api.post('/portal/api/auth/login').send({ email: 'owner@example.com', password: 'Whatever-123' });
    expect(first.body.code).toBe('password_setup_required');
    const token = new URL(env.mail.linkIn(env.mail.last('owner@example.com'))).searchParams.get('token')!;
    const set = await env.api.post('/portal/api/auth/reset-password').send({ token, password: 'New-owner-pass-1' });
    expect(set.status).toBe(200);
    const me = await env.api.get('/portal/api/me').set(auth(set.body.accessToken));
    expect(me.body.apps).toEqual([expect.objectContaining({ id: 'app_japabudz', role: 'owner', gameIds: ['game_memory_001'] })]);
    const app = await env.api.get('/portal/api/apps/app_japabudz').set(auth(set.body.accessToken));
    expect(app.body.keys).toEqual([expect.objectContaining({ id: KEY_ID, label: 'server' })]);

    // The webhook settings and delivery history came across.
    const hook = await env.api.get('/portal/api/apps/app_japabudz/webhook').set(auth(set.body.accessToken));
    expect(hook.body).toMatchObject({ url: 'https://hooks.example.com/sage', secret: 'whsec_old' });
    expect(hook.body.recentDeliveries).toHaveLength(1);
  });

  it('refuses to import into a database that is already in use', async () => {
    fs.writeFileSync(file, JSON.stringify({ format: 'sagegames-export', version: 1 }) + '\n');
    await expect(importExport(env.db, file)).rejects.toThrow(/fresh database/);
  });
});
