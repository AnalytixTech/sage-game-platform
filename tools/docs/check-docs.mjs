// Keeps the docs honest:
//   1. every relative link and #anchor in docs/*.md, README.md and CHANGELOG.md resolves;
//   2. complete code samples (TSX blocks that start with an import) in the quickstart compile
//      against the real SDK.
//   node tools/docs/check-docs.mjs
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const files = [
  ...fs.readdirSync(path.join(ROOT, 'docs')).filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`),
  ...fs.readdirSync(path.join(ROOT, 'docs/guides')).filter((f) => f.endsWith('.md')).map((f) => `docs/guides/${f}`),
  'README.md',
  'CHANGELOG.md',
].filter((f) => fs.existsSync(path.join(ROOT, f)));

/** GitHub-style heading anchors (the portal uses the same rule). */
export const slug = (text) =>
  text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_~]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s/g, '-');

const stripCode = (md) => md.replace(/```[\s\S]*?```/g, '');
const anchorsOf = (file) => {
  const md = stripCode(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  const seen = new Map();
  return new Set(
    [...md.matchAll(/^#{1,6}\s+(.+)$/gm)].map(([, h]) => {
      const base = slug(h.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1'));
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      return n ? `${base}-${n}` : base;
    })
  );
};

const problems = [];
for (const file of files) {
  const md = stripCode(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  for (const [, target] of md.matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^(https?:|mailto:)/.test(target)) continue;
    const [p, anchor] = target.split('#');
    const resolved = p ? path.posix.normalize(path.posix.join(path.posix.dirname(file), p)) : file;
    if (!fs.existsSync(path.join(ROOT, resolved))) {
      problems.push(`${file}: broken link ${target}`);
      continue;
    }
    if (anchor && resolved.endsWith('.md') && !anchorsOf(resolved).has(anchor)) problems.push(`${file}: missing anchor ${target}`);
  }
}

// ---- code samples
const SAMPLES = ['docs/QUICKSTART.md'];
const outDir = path.join(ROOT, 'tools/docs/.samples');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
let n = 0;
for (const file of SAMPLES) {
  const md = fs.readFileSync(path.join(ROOT, file), 'utf8');
  for (const [, lang, code] of md.matchAll(/```(tsx?)[^\n]*\n([\s\S]*?)```/g)) {
    if (!/^import /m.test(code)) continue; // fragments aren't complete modules
    fs.writeFileSync(path.join(outDir, `sample${++n}.${lang}`), `${code}\nexport {};\n`);
  }
}
fs.writeFileSync(
  path.join(outDir, 'globals.d.ts'),
  `// Names the samples assume exist in the reader's app.
declare const App: () => JSX.Element;
declare module '@react-native-async-storage/async-storage' { const storage: { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void>; removeItem(k: string): Promise<void> }; export default storage; }
`
);
fs.writeFileSync(
  path.join(outDir, 'tsconfig.json'),
  JSON.stringify({ extends: '../../playground/tsconfig.json', compilerOptions: { noEmit: true, jsx: 'react-jsx', types: [], lib: ['ES2022', 'DOM', 'DOM.Iterable'] }, include: ['./*.tsx', './*.ts', '../../../packages/*/src', '../../../games/*/src'] }, null, 2)
);
try {
  execFileSync(process.execPath, [path.join(ROOT, 'node_modules/typescript/bin/tsc'), '-p', path.join(outDir, 'tsconfig.json')], { stdio: 'pipe' });
} catch (err) {
  problems.push(`code samples don't compile:\n${String(err.stdout || err.message).trim()}`);
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`docs ok: ${files.length} files, links and anchors resolve; ${n} code samples compile`);
