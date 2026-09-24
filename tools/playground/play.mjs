// Plays each game in the playground with real clicks, drags and taps, and screenshots key moments.
//   node tools/playground/play.mjs <outDir>
// Uses the compiled rules (npm run build:packages) with the playground's seed to know the answers.
import { chromium } from 'playwright';
import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire(import.meta.url);
const { memoryMatchRules } = require('../../games/memory-match/dist/index.js');
const { quizMasterRules } = require('../../games/quiz-master/dist/index.js');
const { sudokuRules } = require('../../games/sudoku/dist/index.js');
const { wordSearchRules } = require('../../games/word-search/dist/index.js');
const { wordRushRules, isDictionaryWord, areAdjacent } = require('../../games/word-rush/dist/index.js');

const out = process.argv[2] ?? 'shots';
fs.mkdirSync(out, { recursive: true });
const SEED = 'playground';
// Extra query (e.g. 'sdk=web') is appended to every page.
const EXTRA = process.argv[3] ? `&${process.argv[3]}` : '';
const BASE = 'http://localhost:5199/';
const failures = [];
const check = (cond, msg) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!cond) failures.push(msg);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const shot = (name) => page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
const text = () => page.locator('body').innerText();

/** Centre of cell (row, col) in an n x n grid element, in page coordinates. */
async function cellCenter(testId, n, row, col, gap = 0) {
  const box = await page.getByTestId(testId).boundingBox();
  const inner = box.width - 2; // 1px border
  const size = (inner - gap * (n - 1)) / n;
  return { x: box.x + 1 + col * (size + gap) + size / 2, y: box.y + 1 + row * (size + gap) + size / 2 };
}

// ---- Memory, through the full launcher: intro → play → verified result + leaderboard
{
  await page.goto(`${BASE}?${EXTRA.slice(1)}&view=launcher&game=game_memory_001`, { waitUntil: 'networkidle' });
  await page.getByText('Play', { exact: true }).click();
  const state = memoryMatchRules.init(SEED, memoryMatchRules.parseConfig({}));
  const pairs = new Map();
  state.cards.forEach((c, i) => pairs.set(c.face, [...(pairs.get(c.face) ?? []), i]));
  const list = [...pairs.values()];

  // One deliberate miss, then every pair.
  await page.getByTestId(`memory-card-${list[0][0]}`).click();
  await page.getByTestId(`memory-card-${list[1][0]}`).click();
  await page.waitForTimeout(300);
  await shot('memory_1_mismatch');
  check((await text()).includes('MOVES\n1') || (await text()).includes('Moves\n1'), 'memory: a move is counted after two flips');
  await page.waitForTimeout(1000);
  for (const [a, b] of list.slice(0, 3)) {
    await page.getByTestId(`memory-card-${a}`).click();
    await page.getByTestId(`memory-card-${b}`).click();
    await page.waitForTimeout(250);
  }
  await shot('memory_2_midgame');
  for (const [a, b] of list.slice(3)) {
    await page.getByTestId(`memory-card-${a}`).click();
    await page.getByTestId(`memory-card-${b}`).click();
    await page.waitForTimeout(250);
  }
  await page.getByText('Your score', { exact: false }).waitFor({ timeout: 5000 });
  await page.waitForTimeout(400);
  await shot('memory_3_result');
  const t = await text();
  check(t.includes('800'), 'memory: server-verified score shown (6 pairs, one missed pair loses its bonus = 800)');
  check(t.includes('Leaderboard') && t.includes('Amara'), 'memory: chat leaderboard shown on the result screen');
  check(t.includes('Verified score'), 'memory: verified badge shown');
}

// ---- Quiz: answer correctly and see feedback
{
  await page.goto(`${BASE}?${EXTRA.slice(1)}&view=quiz`, { waitUntil: 'networkidle' });
  const state = quizMasterRules.init(SEED, quizMasterRules.parseConfig({}));
  await page.getByTestId(`quiz-option-${state.questions[0].correctIndex}`).click();
  await page.waitForTimeout(150);
  await shot('quiz_1_correct');
  check((await text()).includes('Correct!'), 'quiz: correct answer shows "Correct!"');
  const wrong = (state.questions[1].correctIndex + 1) % 4;
  await page.getByTestId(`quiz-option-${wrong}`).click();
  await page.waitForTimeout(150);
  await shot('quiz_2_wrong');
  check((await text()).includes(`The answer was: ${state.questions[1].options[state.questions[1].correctIndex]}`), 'quiz: wrong answer reveals the right one');
}

// ---- Sudoku: select a cell, enter right and wrong digits
{
  await page.goto(`${BASE}?${EXTRA.slice(1)}&view=sudoku`, { waitUntil: 'networkidle' });
  const state = sudokuRules.init(SEED, sudokuRules.parseConfig({ variant: '9x9' }));
  const open = state.givens.map((g, i) => (g ? -1 : i)).filter((i) => i >= 0);
  const [a, b] = [open[3], open[4]];
  await page.getByTestId(`sudoku-cell-${a}`).click();
  await page.getByRole('button', { name: `Enter ${state.solution[a]}` }).click();
  await page.getByTestId(`sudoku-cell-${b}`).click();
  await page.getByRole('button', { name: `Enter ${(state.solution[b] % 9) + 1}` }).click();
  await page.getByRole('button', { name: /Notes/ }).click();
  await page.getByTestId(`sudoku-cell-${open[5]}`).click();
  for (const d of [1, 4, 7]) await page.getByRole('button', { name: `Note ${d}` }).click();
  await page.waitForTimeout(150);
  await shot('sudoku_1_entries');
  const t = await text();
  check(/MISTAKES\s*1/i.test(t), 'sudoku: wrong digit counts a mistake');
}

// ---- Word search: drag across one word, tap-tap another
{
  const config = {
    categoryName: 'Custom Terms',
    wordSelectionMode: 'combine',
    words: ['PASSPORT', 'VISA', 'IMMIGRATION', 'CAMPUS', 'SCHOLARSHIP'].map((t) => ({ token: t, display: t[0] + t.slice(1).toLowerCase() })),
    gridSize: 10,
    difficulty: 'medium',
  };
  await page.goto(`${BASE}?${EXTRA.slice(1)}&view=wordsearch`, { waitUntil: 'networkidle' });
  const state = wordSearchRules.init(SEED, wordSearchRules.parseConfig(config));
  const n = state.size;
  const rc = (i) => [Math.floor(i / n), i % n];

  const [w1, w2] = [state.words.find((w) => w.token === 'IMMIGRATION'), state.words.find((w) => w.token === 'VISA')];
  const from = await cellCenter('word-search-grid', n, ...rc(w1.cells[0]));
  const to = await cellCenter('word-search-grid', n, ...rc(w1.cells[w1.cells.length - 1]));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 5 });
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();

  const a = await cellCenter('word-search-grid', n, ...rc(w2.cells[0]));
  const b = await cellCenter('word-search-grid', n, ...rc(w2.cells[w2.cells.length - 1]));
  await page.mouse.click(a.x, a.y);
  await page.mouse.click(b.x, b.y);
  await page.waitForTimeout(150);
  await shot('wordsearch_1_found');
  check((await text()).includes('2/13'), 'word search: drag and tap-tap both find words (2/13)');
}

// ---- Word rush: drag a real word, and tap another
{
  await page.goto(`${BASE}?${EXTRA.slice(1)}&view=wordrush`, { waitUntil: 'networkidle' });
  const state = wordRushRules.init(SEED, wordRushRules.parseConfig({}));
  const found = [];
  const walk = (path) => {
    const w = path.map((i) => state.grid[i]).join('').toLowerCase();
    if (w.length >= 3 && isDictionaryWord(w) && !found.some((f) => f.w === w)) found.push({ w, path });
    if (path.length === 4) return;
    for (let j = 0; j < 16; j++) if (!path.includes(j) && areAdjacent(4, path[path.length - 1], j)) walk([...path, j]);
  };
  for (let s = 0; s < 16; s++) walk([s]);
  const [first, second] = found.sort((x, y) => y.w.length - x.w.length);

  const center = async (i) => cellCenter('word-rush-grid', 4, Math.floor(i / 4), i % 4, 8);
  const p0 = await center(first.path[0]);
  await page.mouse.move(p0.x, p0.y);
  await page.mouse.down();
  for (const i of first.path.slice(1)) {
    const p = await center(i);
    await page.mouse.move(p.x, p.y, { steps: 6 });
  }
  await page.mouse.up();
  await page.waitForTimeout(150);
  check((await text()).includes(`${first.w.toUpperCase()} +`), `word rush: dragging "${first.w}" scores it`);

  for (const i of second.path) {
    const p = await center(i);
    await page.mouse.click(p.x, p.y);
  }
  await page.waitForTimeout(100);
  await shot('wordrush_1_tapping');
  await page.getByText('Submit', { exact: true }).click();
  await page.waitForTimeout(150);
  await shot('wordrush_2_scored');
  check(/WORDS\s*2/i.test(await text()), `word rush: tapping "${second.w}" + Submit scores it (2 words)`);
}

console.log(errors.length ? `page errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
process.exit(failures.length ? 1 : 0);
