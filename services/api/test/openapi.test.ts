import fs from 'fs';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { createTestEnv, TestEnv } from './support/setup';

const ROOT = path.resolve(__dirname, '../../..');
const spec = parse(fs.readFileSync(path.join(ROOT, 'docs/openapi.yaml'), 'utf8')) as { paths: Record<string, Record<string, unknown>> };

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

/** "GET /v2/sessions/{sessionId}" for every documented operation. */
const documented = new Set(
  Object.entries(spec.paths).flatMap(([p, ops]) => Object.keys(ops).filter((m) => METHODS.includes(m)).map((m) => `${m.toUpperCase()} ${p}`))
);

/** The same, read from the route files (":param" → "{param}"). */
function declared(file: string, prefix: string): string[] {
  const src = fs.readFileSync(path.join(ROOT, 'services/api/src/routes', file), 'utf8');
  return [...src.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)].map(([, m, p]) => {
    const full = `${prefix}${p === '/' ? '' : p}`.replace(/:([A-Za-z]+)/g, '{$1}');
    return `${m.toUpperCase()} ${full}`;
  });
}

describe('API reference (docs/openapi.yaml)', () => {
  const routes = new Set([...declared('v2.ts', '/v2'), ...declared('matches.ts', '/v2/matches')]);

  it('documents every public v2 route', () => {
    expect([...routes].filter((r) => !documented.has(r))).toEqual([]);
  });

  it('documents nothing that does not exist', () => {
    expect([...documented].filter((r) => !routes.has(r))).toEqual([]);
  });

  describe('against the running app', () => {
    let env: TestEnv;
    beforeAll(async () => {
      env = await createTestEnv();
    });
    afterAll(async () => {
      await env.db.close();
    });

    it('every documented route is served (not the catch-all 404)', async () => {
      const missing: string[] = [];
      for (const op of documented) {
        const [method, p] = op.split(' ');
        const url = p.replace(/\{[^}]+\}/g, 'x_probe');
        const res = await (env.api as unknown as Record<string, (u: string) => { send: (b: unknown) => Promise<{ status: number; body: { code?: string } }> }>)[method.toLowerCase()](url).send({});
        if (res.status === 404 && res.body.code === 'not_found') missing.push(op);
      }
      expect(missing).toEqual([]);
    });
  });
});
