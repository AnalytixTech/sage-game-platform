/**
 * A small syntax highlighter for the docs (ts/tsx/js, json, bash, python, yaml, env). It returns
 * escaped HTML with class-based spans (colours come from CSS), so there's nothing to sanitise.
 */

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const KEYWORDS: Record<string, string[]> = {
  ts: ['import', 'from', 'export', 'default', 'const', 'let', 'var', 'function', 'return', 'if', 'else', 'await', 'async', 'new', 'type', 'interface', 'extends', 'as', 'typeof', 'for', 'of', 'in', 'while', 'throw', 'try', 'catch', 'class', 'true', 'false', 'null', 'undefined'],
  python: ['import', 'from', 'def', 'return', 'if', 'else', 'elif', 'not', 'and', 'or', 'for', 'in', 'with', 'as', 'True', 'False', 'None', 'pass'],
  bash: ['curl', 'npm', 'npx', 'export', 'git', 'cd'],
};

const LANG: Record<string, keyof typeof KEYWORDS | 'json' | 'yaml' | 'plain'> = {
  ts: 'ts', tsx: 'ts', js: 'ts', jsx: 'ts', typescript: 'ts', javascript: 'ts', json: 'json',
  bash: 'bash', sh: 'bash', shell: 'bash', env: 'bash', python: 'python', py: 'python', yaml: 'yaml', yml: 'yaml',
};

interface Rule {
  re: RegExp;
  cls: string;
}

function rules(lang: string): Rule[] {
  const kind = LANG[lang] ?? 'plain';
  const hashComments = kind === 'bash' || kind === 'python' || kind === 'yaml';
  const list: Rule[] = [];
  if (kind === 'ts') list.push({ re: /\/\/[^\n]*|\/\*[\s\S]*?\*\//y, cls: 'tok-comment' });
  if (hashComments) list.push({ re: /#[^\n]*/y, cls: 'tok-comment' });
  if (kind === 'ts') list.push({ re: /`(?:\\[\s\S]|[^`\\])*`/y, cls: 'tok-string' });
  list.push({ re: /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/y, cls: 'tok-string' });
  if (kind === 'yaml') list.push({ re: /[A-Za-z_][\w.-]*(?=:)/y, cls: 'tok-key' });
  if (kind === 'json') list.push({ re: /\b(true|false|null)\b/y, cls: 'tok-keyword' });
  if (KEYWORDS[kind as string]) list.push({ re: new RegExp(`\\b(${KEYWORDS[kind as string].join('|')})\\b`, 'y'), cls: 'tok-keyword' });
  if (kind === 'ts') list.push({ re: /<\/?[A-Z][\w.]*/y, cls: 'tok-tag' });
  if (kind === 'bash') list.push({ re: /\$\{?[A-Za-z_][\w]*\}?/y, cls: 'tok-var' }, { re: /\s-{1,2}[A-Za-z][\w-]*/y, cls: 'tok-flag' });
  list.push({ re: /\b\d[\d_.]*\b/y, cls: 'tok-number' });
  return list;
}

export function highlight(code: string, lang: string): string {
  const list = rules(lang.toLowerCase());
  let out = '';
  let plain = '';
  let i = 0;
  outer: while (i < code.length) {
    for (const { re, cls } of list) {
      re.lastIndex = i;
      const m = re.exec(code);
      if (m && m.index === i && m[0].length > 0) {
        out += escape(plain) + `<span class="${cls}">${escape(m[0])}</span>`;
        plain = '';
        i += m[0].length;
        continue outer;
      }
    }
    // Skip over the rest of a word so keywords only match whole words.
    const word = /[A-Za-z0-9_$]+/y;
    word.lastIndex = i;
    const w = word.exec(code);
    const step = w && w.index === i ? w[0].length : 1;
    plain += code.slice(i, i + step);
    i += step;
  }
  return out + escape(plain);
}
