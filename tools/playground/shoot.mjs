// Screenshots the playground at phone size: node tools/playground/shoot.mjs <outDir> [view…]
import { chromium } from 'playwright';
import fs from 'fs';

const out = process.argv[2] ?? 'shots';
const views = process.argv.slice(3);
fs.mkdirSync(out, { recursive: true });

const targets = views.length
  ? views
  : ['memory', 'quiz', 'sudoku', 'sudoku&variant=7x7_irregular', 'wordsearch', 'wordrush', 'memory&theme=light', 'launcher&game=game_memory_001'];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));

for (const t of targets) {
  await page.goto(`http://localhost:5199/?view=${t}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const name = t.replace(/[^a-z0-9]+/gi, '_');
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  console.log('shot', name);
}
console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
