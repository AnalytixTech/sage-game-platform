import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import { createLogger, redact } from '../src/observability/logger';
import { createTestEnv, TestEnv } from './support/setup';

describe('logger', () => {
  it('writes one JSON object per line with bindings', () => {
    const lines: string[] = [];
    const log = createLogger({ write: (l) => lines.push(l), bindings: { service: 'api' } }).child({ component: 'webhooks' });
    log.info('delivered', { attempts: 2 });
    expect(JSON.parse(lines[0])).toMatchObject({ level: 'info', msg: 'delivered', service: 'api', component: 'webhooks', attempts: 2 });
    expect(Number.isNaN(Date.parse(JSON.parse(lines[0]).time))).toBe(false);
  });

  it('respects the level', () => {
    const lines: string[] = [];
    const log = createLogger({ level: 'warn', write: (l) => lines.push(l) });
    log.debug('a');
    log.info('b');
    log.warn('c');
    log.error('d');
    expect(lines.map((l) => JSON.parse(l).msg)).toEqual(['c', 'd']);
  });

  it('never writes credentials, by field name or by shape', () => {
    const out = redact({
      headers: { authorization: 'Bearer eyJhbGciOi.abc.def', 'x-request-id': 'r1' },
      apiKey: 'anything',
      webhookSecret: 'whsec_123',
      note: 'used sk_live_k1_abcdef and stk_0123abcd then whsec_zz and Bearer abc.def',
      nested: [{ token: 'x', keyId: 'k1' }],
      err: new Error('bad key sk_test_k2_secretpart'),
    }) as Record<string, any>;
    expect(out.headers.authorization).toBe('[redacted]');
    expect(out.headers['x-request-id']).toBe('r1');
    expect(out.apiKey).toBe('[redacted]');
    expect(out.webhookSecret).toBe('[redacted]');
    expect(out.note).toBe('used sk_live_[redacted] and stk_[redacted] then whsec_[redacted] and Bearer [redacted]');
    expect(out.nested[0]).toEqual({ token: '[redacted]', keyId: 'k1' });
    expect(out.err.message).toBe('bad key sk_test_[redacted]');
    expect(JSON.stringify(out)).not.toMatch(/secretpart|abcdef|0123abcd/);
  });

  it('removes passwords from connection strings', () => {
    expect(redact('connect failed: postgresql://postgres.ref:S3cr3t!pw@aws-1.pooler.supabase.com:5432/postgres')).toBe(
      'connect failed: postgresql://postgres.ref:[redacted]@aws-1.pooler.supabase.com:5432/postgres'
    );
  });

  it('hands errors to the reporter even when the level hides them, and survives a failing reporter', () => {
    const reported: unknown[] = [];
    const log = createLogger({ level: 'silent', onError: (err) => reported.push(err) });
    const boom = new Error('boom');
    log.error('failed', { err: boom });
    log.error('no error object'); // nothing to report
    expect(reported).toEqual([boom]);

    const throwing = createLogger({ level: 'silent', onError: () => { throw new Error('reporter down'); } });
    expect(() => throwing.error('failed', { err: boom })).not.toThrow();
  });
});

describe('request logging', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv();
  });
  afterEach(async () => {
    await env.db.close();
  });

  it('logs each request with an id, without query strings or credentials', async () => {
    const res = await env.api.get('/v2/leaderboards/game_memory_001?contextId=group:secret-chat').set('Authorization', 'Bearer sk_live_k1_abc');
    expect(res.status).toBe(403);
    const id = res.headers['x-request-id'];
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    const line = env.logs.find((l) => l.msg === 'request' && l.requestId === id)!;
    expect(line).toMatchObject({ level: 'info', component: 'http', method: 'GET', path: '/v2/leaderboards/game_memory_001', status: 403, code: 'invalid_api_key' });
    expect(typeof line.ms).toBe('number');
    expect(JSON.stringify(env.logs)).not.toMatch(/secret-chat|sk_live_k1_abc/);
  });

  it('keeps a sane incoming X-Request-Id and replaces a bad one', async () => {
    expect((await env.api.get('/v2/games').set('X-Request-Id', 'render-abc12345')).headers['x-request-id']).toBe('render-abc12345');
    expect((await env.api.get('/v2/games').set('X-Request-Id', '<script>')).headers['x-request-id']).toMatch(/^[0-9a-f]{16}$/);
  });

  it('logs unexpected errors with the request id and answers a plain 500', async () => {
    const query = env.ctx.db.query;
    env.ctx.db.query = async () => {
      throw new Error('connection to server failed (password=hunter2, key sk_live_k9_leak)');
    };
    const res = await env.api.get('/healthz');
    env.ctx.db.query = query;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error', code: 'internal' });
    const entry = env.logs.find((l) => l.msg === 'unhandled error')!;
    expect(entry).toMatchObject({ level: 'error', requestId: res.headers['x-request-id'], method: 'GET', path: '/healthz' });
    expect((entry.err as { stack: string }).stack).toContain('connection to server failed');
    expect(JSON.stringify(entry)).not.toContain('sk_live_k9_leak');
  });
});

describe('logging config', () => {
  const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon' };

  it('treats empty variables as unset (SENTRY_DSN= in a .env file)', () => {
    const c = loadConfig({ ...base, SENTRY_DSN: '', LOG_LEVEL: '' });
    expect(c.sentryDsn).toBeUndefined();
    expect(c.logLevel).toBe('info');
  });

  it('logs JSON in production and readable lines elsewhere, unless told otherwise', () => {
    expect(loadConfig({ ...base, NODE_ENV: 'production', API_KEY_PEPPER: 'x'.repeat(32) }).logFormat).toBe('json');
    expect(loadConfig({ ...base }).logFormat).toBe('pretty');
    expect(loadConfig({ ...base, LOG_FORMAT: 'json' }).logFormat).toBe('json');
  });

  it('rejects a malformed Sentry DSN', () => {
    expect(() => loadConfig({ ...base, SENTRY_DSN: 'not a url' })).toThrow(/SENTRY_DSN/);
  });
});
