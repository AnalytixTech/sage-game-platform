// Screenshots the developer portal with a mocked API and a fake signed-in session (no database, no keys).
//   npm run build -w services/portal && (cd services/portal && npx vite preview --port 4174 &)
//   node tools/portal-preview/shoot.mjs <outDir>
import { chromium } from 'playwright';
import fs from 'fs';

const out = process.argv[2] ?? 'portal-shots';
const BASE = process.env.PORTAL_URL ?? 'http://localhost:4174/portal';
fs.mkdirSync(out, { recursive: true });

const now = Date.now();
const iso = (msAgo) => new Date(now - msAgo).toISOString();
const APP = { id: 'app_japabudz01', name: 'Japabudz', status: 'active', role: 'owner', gameIds: ['game_quiz_001', 'game_memory_001', 'game_sudoku_001', 'game_word_search_001', 'game_word_001'], webhookUrl: null, createdAt: iso(9e8) };
const KEYS = [
  { id: 'k1', mode: 'live', label: 'production server', preview: 'sk_live_k1…9f2a', createdAt: iso(8e8), lastUsedAt: iso(3.6e6), revokedAt: null },
  { id: 'k2', mode: 'test', label: 'staging', preview: 'sk_test_k2…77b0', createdAt: iso(7e8), lastUsedAt: null, revokedAt: null },
];
const DAYS = Array.from({ length: 30 }, (_, i) => {
  const day = new Date(now - (29 - i) * 864e5).toISOString().slice(0, 10);
  const sessions = Math.round(20 + 15 * Math.sin(i / 3) + i * 1.5);
  return { day, sessions, completed: Math.round(sessions * 0.8), verified: Math.round(sessions * 0.74) };
});
const RESULTS = [
  ['Ada', 'game_memory_001', 900, true],
  ['Bayo', 'game_word_001', 640, true],
  ['Chidi', 'game_quiz_001', 1180, true],
  ['Dayo', 'game_sudoku_001', 0, false],
].map(([n, g, s, v], i) => ({ sessionId: `s${i}`, gameId: g, externalUserId: n.toLowerCase(), displayName: n, status: v ? 'verified' : 'rejected', valid: v, isTest: false, score: s, completedAt: iso(i * 9e5 + 6e4) }));
const GAMES = [
  ['game_quiz_001', 'Quiz Master', 'Timed multiple-choice questions.'],
  ['game_memory_001', 'Memory Match', 'Flip cards and find the pairs.'],
  ['game_sudoku_001', 'Sudoku Arena', 'Classic and irregular Sudoku.'],
  ['game_word_search_001', 'Word Search', 'Find the hidden words.'],
  ['game_word_001', 'Word Rush', 'Make words from a letter grid against the clock.'],
].map(([id, name, description]) => ({ id, name, description, category: 'puzzle' }));

const USER = { id: 'u1', email: 'dev@japabudz.com' };

function mock(url) {
  const path = new URL(url).pathname.replace(/^\/portal\/api/, '');
  if (path === '/config') return { apiBaseUrl: 'https://api.sagegames.dev' };
  if (path === '/me') return { user: USER, apps: [APP, { ...APP, id: 'app_campus02', name: 'Campus Quiz Night', gameIds: ['game_quiz_001'] }] };
  if (/^\/apps\/[^/]+$/.test(path)) return { ...APP, keys: KEYS };
  if (path.endsWith('/usage')) return { days: 30, daily: DAYS };
  if (path.endsWith('/results')) return RESULTS;
  if (path.endsWith('/webhook')) return { url: null, secret: null, recentDeliveries: [] };
  if (path.endsWith('/quiz-banks')) return [{ bankId: 'japa', name: 'Japa basics', questionCount: 24, updatedAt: iso(2e8) }];
  if (path === '/v2/games') return GAMES;
  return {};
}

const browser = await chromium.launch();
const errors = [];

async function session(page, signedIn = true) {
  await page.route('**/portal/api/**', (r) => {
    // The refresh cookie is "valid" when signed in: the portal restores the session from it.
    if (r.request().url().endsWith('/auth/refresh')) {
      return signedIn
        ? r.fulfill({ json: { accessToken: 'preview', expiresIn: 900, user: USER } })
        : r.fulfill({ status: 401, json: { error: 'Please sign in again', code: 'unauthorized' } });
    }
    return r.fulfill({ json: mock(r.request().url()) });
  });
  await page.route('**/v2/games', (r) => r.fulfill({ json: GAMES }));
  page.on('pageerror', (e) => errors.push(e.message));
}

async function shoot(name, path, { width = 1280, height = 860, signedIn = true, act } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await session(page, signedIn);
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  if (act) await act(page);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: false });
  console.log('shot', name);
  await page.close();
}

const views = process.argv.slice(3);
const all = {
  auth: () => shoot('auth', '/', { signedIn: false }),
  account: () => shoot('account', '/account', { height: 1000 }),
  apps: () => shoot('apps', '/'),
  overview: () => shoot('overview', `/apps/${APP.id}/overview`),
  keys: () => shoot('keys', `/apps/${APP.id}/keys`),
  studio: () => shoot('studio', `/apps/${APP.id}/design`, { height: 1000, act: (p) => p.waitForTimeout(1200) }),
  'studio-brand': () =>
    shoot('studio_brand', `/apps/${APP.id}/design`, {
      height: 1000,
      act: async (p) => {
        await p.getByRole('radio', { name: 'Your brand colour' }).click();
        await p.getByLabel('Brand colour hex').fill('#e11d48');
        await p.getByRole('radio', { name: 'Light' }).click();
        await p.getByRole('radio', { name: 'Game only' }).click();
        await p.waitForTimeout(800);
      },
    }),
  mobile: () => shoot('mobile_overview', `/apps/${APP.id}/overview`, { width: 390, height: 844 }),
  'mobile-menu': () => shoot('mobile_menu', `/apps/${APP.id}/overview`, { width: 390, height: 844, act: (p) => p.getByLabel('Menu').click().then(() => p.waitForTimeout(400)) }),
  light: () => shoot('light_overview', `/apps/${APP.id}/overview`, { act: (p) => p.evaluate(() => (document.documentElement.dataset.theme = 'light')) }),
  'docs-home': () => shoot('docs_home', '/docs', { signedIn: false }),
  'docs-quickstart': () => shoot('docs_quickstart', '/docs/quickstart#show-the-game', { signedIn: true, height: 1000 }),
  'docs-games': () => shoot('docs_games', '/docs/games#memory-match', { signedIn: false, height: 1000, act: (p) => p.waitForTimeout(1500) }),
  'docs-api': () => shoot('docs_api', '/docs/api#battles', { signedIn: false, height: 1000 }),
  'docs-search': () =>
    shoot('docs_search', '/docs/webhooks', {
      signedIn: false,
      act: async (p) => {
        await p.keyboard.press('/');
        await p.keyboard.type('webhook signature');
        await p.waitForTimeout(300);
      },
    }),
  'docs-mobile': () => shoot('docs_mobile', '/docs/design', { signedIn: false, width: 390, height: 844 }),
};
for (const [k, fn] of Object.entries(all)) if (!views.length || views.includes(k)) await fn();
console.log(errors.length ? `page errors:\n${[...new Set(errors)].join('\n')}` : 'no page errors');
await browser.close();
process.exit(errors.length ? 1 : 0);
