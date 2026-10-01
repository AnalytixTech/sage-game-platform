// The whole platform flow against the production server (services/api/dist/server.js --migrate) on
// any database, with the built portal:
//   sign up → confirm email → sign in → reset password (portal pages, real browser)
//   create an app, a key, a webhook and a quiz bank → a verified game → leaderboard (HTTP API)
//
//   npm run build && node tools/e2e/full-flow.mjs sqlite:./.e2e/sagegames.db
//   node tools/e2e/full-flow.mjs mysql://root@127.0.0.1:3306/sagegames_e2e
//
// Emails aren't sent (no BREVO_API_KEY): the server logs their links, which this script follows.
import { spawn } from 'child_process';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { GameRuntime } = require(path.join(root, 'packages/core/dist/index.js'));
const { memoryMatchRules } = require(path.join(root, 'games/memory-match/dist/index.js'));

const DATABASE_URL = process.argv[2] ?? 'sqlite::memory:';
const PORT = Number(process.env.E2E_PORT ?? 4300);
const BASE = `http://localhost:${PORT}`;
const failures = [];
const check = (cond, msg) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!cond) failures.push(msg);
};

// ---- Start the server
const logs = [];
const server = spawn(process.execPath, [path.join(root, 'services/api/dist/server.js'), '--migrate'], {
  env: { ...process.env, NODE_ENV: 'development', PORT: String(PORT), DATABASE_URL, PUBLIC_BASE_URL: BASE, LOG_FORMAT: 'json', LOG_LEVEL: 'info' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const onLine = (chunk) => chunk.toString().split('\n').filter(Boolean).forEach((l) => logs.push(l));
server.stdout.on('data', onLine);
server.stderr.on('data', onLine);
const stop = () => server.kill('SIGTERM');

async function waitFor(fn, what, ms = 30_000) {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v) return v;
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}\n${logs.slice(-20).join('\n')}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

/** The newest emailed link for an address (from the server's "email not sent" log lines). */
const linkFor = (to, kind) =>
  waitFor(async () => {
    for (const line of [...logs].reverse()) {
      try {
        const e = JSON.parse(line);
        if (e.to === to && Array.isArray(e.links)) {
          const link = e.links.find((l) => l.includes(kind));
          if (link) return link;
        }
      } catch {
        /* not JSON */
      }
    }
    return null;
  }, `${kind} email to ${to}`);

const json = async (res) => ({ status: res.status, body: await res.json().catch(() => ({})) });
const call = (method, url, token, body) =>
  fetch(`${BASE}${url}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }).then(json);

try {
  const health = await waitFor(() => fetch(`${BASE}/healthz`).then((r) => (r.ok ? r.json() : null)), 'the server');
  check(health.migrations === 'current', `server up on ${health.database}, migrations current`);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const email = `owner+${Date.now()}@example.com`;
  const password = 'First-pass-2026';

  // ---- Sign up and confirm
  await page.goto(`${BASE}/portal/`);
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByText('We sent a confirmation link').waitFor();
  check(true, 'sign up shows "check your inbox"');

  await page.goto(await linkFor(email, '/portal/verify-email'));
  await page.getByText('Your apps').first().waitFor({ timeout: 15_000 });
  check(true, 'the emailed link confirms the account and signs in');

  // ---- Session survives a reload (refresh cookie), sign out, sign in
  await page.reload();
  await page.getByText('Your apps').first().waitFor();
  check(true, 'a reload keeps you signed in');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('heading', { name: 'Sign in' }).waitFor();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Your apps').first().waitFor();
  check(true, 'sign out, then sign in again');

  // ---- Forgot password → reset
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await page.getByText('a password reset link is on its way').waitFor();
  await page.goto(await linkFor(email, '/portal/reset-password'));
  await page.getByLabel('New password').fill('Second-pass-2026');
  await page.getByRole('button', { name: 'Save password' }).click();
  await page.getByText('Your apps').first().waitFor();
  check(true, 'reset the password from the emailed link');

  // ---- An app, a key, a webhook and a quiz bank (with the portal's own access token)
  const token = await page.evaluate(async () => {
    const r = await fetch('/portal/api/auth/refresh', { method: 'POST', headers: { 'X-Requested-With': 'sagegames-portal' } });
    return (await r.json()).accessToken;
  });
  const app = await call('POST', '/portal/api/apps', token, { name: 'E2E app' });
  check(app.status === 201, 'create an app');
  const key = await call('POST', `/portal/api/apps/${app.body.id}/keys`, token, { label: 'server' });
  check(key.status === 201 && /^sk_live_/.test(key.body.key), 'create an API key');
  const hook = await call('PUT', `/portal/api/apps/${app.body.id}/webhook`, token, { url: 'https://hooks.example.com/sage' });
  check(hook.status === 200 && hook.body.secret?.startsWith('whsec_'), 'set a webhook');
  const bank = await call('PUT', `/portal/api/apps/${app.body.id}/quiz-banks/e2e`, token, {
    name: 'E2E',
    questions: [{ question: 'Capital of Nigeria?', answer: 'Abuja', wrong: ['Lagos', 'Kano', 'Ibadan'] }],
  });
  check(bank.status === 200 && bank.body.questionCount === 1, 'save a quiz bank');

  // ---- A verified game
  const s = await call('POST', '/v2/sessions', key.body.key, { gameId: 'game_memory_001', externalUserId: 'ada', displayName: 'Ada' });
  check(s.status === 201, 'create a session with the key');
  const play = await call('GET', `/v2/sessions/${s.body.sessionId}/play`, s.body.sessionToken);
  await call('POST', `/v2/sessions/${s.body.sessionId}/start`, s.body.sessionToken, { rulesVersion: play.body.rulesVersion });
  let t = Date.now();
  const runtime = new GameRuntime({ rules: memoryMatchRules, seed: play.body.seed, config: play.body.config, now: () => t });
  runtime.start();
  const pairs = new Map();
  runtime.getSnapshot().state.cards.forEach((c, i) => pairs.set(c.face, [...(pairs.get(c.face) ?? []), i]));
  for (const [a, b] of pairs.values()) {
    t += 700;
    runtime.dispatch('FLIP', { index: a });
    t += 700;
    runtime.dispatch('FLIP', { index: b });
  }
  await new Promise((r) => setTimeout(r, Math.max(0, t - Date.now()) + 200)); // the server checks elapsed time
  const done = await call('POST', `/v2/sessions/${s.body.sessionId}/complete`, s.body.sessionToken, { log: runtime.getLog() });
  check(done.body.status === 'verified' && done.body.valid && done.body.rank === 1, `the server replays and verifies the score (${done.body.score})`);
  const board = await call('GET', '/v2/leaderboards/game_memory_001', key.body.key);
  check(board.body.entries?.[0]?.externalUserId === 'ada', 'the leaderboard shows it');
  const deliveries = await call('GET', `/portal/api/apps/${app.body.id}/webhook`, token);
  check(deliveries.body.recentDeliveries?.[0]?.event === 'session.completed', 'a session.completed webhook is queued');

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join('; ')}` : ''}`);
  await browser.close();
} catch (err) {
  failures.push(String(err));
  console.error(err);
} finally {
  stop();
}
process.exit(failures.length ? 1 : 0);
