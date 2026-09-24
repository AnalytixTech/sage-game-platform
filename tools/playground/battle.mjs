// Plays a two-player Memory battle in the playground (both players side by side) and checks
// lobby → countdown → race → standings.
//   node tools/playground/battle-server.mjs & npm run playground &
//   node tools/playground/battle.mjs <outDir> [sdk=web]
import { chromium } from 'playwright';
import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire(import.meta.url);
const { memoryMatchRules } = require('../../games/memory-match/dist/index.js');

const out = process.argv[2] ?? 'battle-shots';
const extra = process.argv[3] ? `&${process.argv[3]}` : '';
fs.mkdirSync(out, { recursive: true });
const failures = [];
const check = (cond, msg) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!cond) failures.push(msg);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 820, height: 900 }, deviceScaleFactor: 1.5 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let battle = null;
page.on('response', async (res) => {
  if (res.url().endsWith('/dev/battle') && res.request().method() === 'POST') battle = await res.json();
});

const col = (i) => page.getByTestId(`player-${i}`);
const text = async (i) => (await col(i).innerText()).replace(/\s+/g, ' ');
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });

await page.goto(`http://localhost:5199/?view=battle${extra}`, { waitUntil: 'networkidle' });
await col(0).getByText("I'm ready").waitFor({ timeout: 10000 });
await col(1).getByText("I'm ready").waitFor();
await page.waitForTimeout(300);
await shot('1_lobby');
check((await text(0)).includes('Ada (You)') && (await text(0)).includes('Bayo'), 'lobby lists both players');

await col(0).getByText("I'm ready").click();
await page.waitForTimeout(300);
await shot('2_one_ready');
check((await text(1)).includes('Ready'), "the other player sees Ada is ready");

await col(1).getByText("I'm ready").click();
await col(0).getByText('Starting in').waitFor({ timeout: 5000 });
await shot('3_countdown');
check(true, 'countdown shown after both are ready');

await col(0).getByTestId('memory-card-0').waitFor({ timeout: 6000 });
const state = memoryMatchRules.init(battle.seed, battle.config);
const pairs = new Map();
state.cards.forEach((c, i) => pairs.set(c.face, [...(pairs.get(c.face) ?? []), i]));
const list = [...pairs.values()];

const flip = async (player, i) => col(player).getByTestId(`memory-card-${i}`).click();
for (const [a, b] of list.slice(0, 2)) {
  await flip(1, a);
  await flip(1, b);
  await page.waitForTimeout(120);
}
for (const [a, b] of list.slice(0, 3)) {
  await flip(0, a);
  await flip(0, b);
  await page.waitForTimeout(120);
}
await page.waitForTimeout(500);
await shot('4_racing');
check((await text(1)).includes('450'), "Bayo sees Ada's live score");

for (const [a, b] of list.slice(3)) {
  await flip(0, a);
  await flip(0, b);
  await page.waitForTimeout(120);
}
await col(0).getByText('You finished').waitFor({ timeout: 5000 });
await page.waitForTimeout(300);
await shot('5_waiting');
check(true, 'finisher waits for the others');

await col(1).getByText('Leave').click();
await col(0).getByText('You won!').waitFor({ timeout: 5000 });
await col(1).getByText('You placed #2').waitFor({ timeout: 5000 });
await page.waitForTimeout(300);
await shot('6_standings');
check((await text(0)).includes('Standings'), 'both players see the final standings');

console.log(errors.length ? `page errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
process.exit(failures.length ? 1 : 0);
