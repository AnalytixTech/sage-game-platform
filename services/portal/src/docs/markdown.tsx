import { lazy, MouseEvent, Suspense, useMemo, useState } from 'react';
import { Marked, Tokens } from 'marked';
import { href as portalHref, navigate } from '../router';
import { rewriteLink, slugify } from './content';
import { highlight } from './highlight';

const GamePreviewBlock = lazy(() => import('./GamePreviewBlock'));

const DEFAULT_API = 'https://sage-game-platform.onrender.com';
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

type Segment =
  | { kind: 'md'; md: string }
  | { kind: 'tabs'; blocks: { label: string; lang: string; code: string }[] }
  | { kind: 'preview'; gameId: string };

/** Split a page into Markdown, tab groups (<!-- tabs --> … <!-- /tabs -->) and live game previews (<!-- preview:gameId -->). */
export function segment(md: string): Segment[] {
  const out: Segment[] = [];
  const re = /<!--\s*tabs\s*-->([\s\S]*?)<!--\s*\/tabs\s*-->|<!--\s*preview:([\w-]+)\s*-->/g;
  let last = 0;
  for (const m of md.matchAll(re)) {
    if (m.index! > last) out.push({ kind: 'md', md: md.slice(last, m.index) });
    if (m[2]) out.push({ kind: 'preview', gameId: m[2] });
    else {
      const blocks = [...m[1].matchAll(/```(\S*)[ \t]*([^\n]*)\n([\s\S]*?)```/g)].map(([, lang, label, code]) => ({ lang, label: label.trim() || lang, code: code.replace(/\n$/, '') }));
      out.push({ kind: 'tabs', blocks });
    }
    last = m.index! + m[0].length;
  }
  if (last < md.length) out.push({ kind: 'md', md: md.slice(last) });
  return out.filter((s) => s.kind !== 'md' || s.md.trim() !== '');
}

const headingText = (raw: string) => raw.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');

/** h2/h3 headings for "On this page", with the same ids the renderer gives them. */
export function tableOfContents(md: string): { id: string; text: string; depth: number }[] {
  const seen = new Map<string, number>();
  const withoutCode = md.replace(/```[\s\S]*?```/g, '');
  return [...withoutCode.matchAll(/^(#{1,6})\s+(.+)$/gm)]
    .map(([, hashes, raw]) => {
      const base = slugify(headingText(raw));
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      return { id: n ? `${base}-${n}` : base, text: headingText(raw).replace(/`/g, ''), depth: hashes.length };
    })
    .filter((h) => h.depth === 2 || h.depth === 3);
}

interface RenderCtx {
  file: string;
  seen: Map<string, number>;
  codes: string[];
  apiBaseUrl: string | null;
}

const personalize = (code: string, api: string | null) => (api && api !== DEFAULT_API ? code.split(DEFAULT_API).join(api) : code);

function codeBlock(ctx: RenderCtx, code: string, lang: string, label: string): string {
  const text = personalize(code, ctx.apiBaseUrl);
  const i = ctx.codes.push(text) - 1;
  return `<div class="doc-code"><div class="doc-code-bar"><span>${escape(label || lang || 'text')}</span><button type="button" class="ghost small" data-copy="${i}">Copy</button></div><pre><code>${highlight(text, lang)}</code></pre></div>`;
}

function renderMarkdown(md: string, ctx: RenderCtx): string {
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading(this: { parser: { parseInline(t: Tokens.Generic[]): string } }, token: Tokens.Heading) {
        const base = slugify(headingText(token.text));
        const n = ctx.seen.get(base) ?? 0;
        ctx.seen.set(base, n + 1);
        const id = n ? `${base}-${n}` : base;
        return `<h${token.depth} id="${id}">${this.parser.parseInline(token.tokens)}<a class="anchor" href="#${id}" aria-label="Link to this section">#</a></h${token.depth}>\n`;
      },
      code(token: Tokens.Code) {
        const [lang = '', ...label] = (token.lang ?? '').split(/\s+/);
        return codeBlock(ctx, token.text, lang, label.join(' '));
      },
      link(this: { parser: { parseInline(t: Tokens.Generic[]): string } }, token: Tokens.Link) {
        const inner = this.parser.parseInline(token.tokens);
        const { to, external } = rewriteLink(ctx.file, token.href);
        if (external) return `<a href="${escape(to)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
        if (to.startsWith('#')) return `<a href="${escape(to)}">${inner}</a>`;
        return `<a href="${escape(portalHref(to))}" data-internal="${escape(to)}">${inner}</a>`;
      },
      table(this: { parser: unknown }, token: Tokens.Table) {
        // Default table markup, wrapped so wide tables scroll on phones.
        const cell = (c: Tokens.TableCell, tag: 'th' | 'td') => `<${tag}>${(this.parser as { parseInline(t: Tokens.Generic[]): string }).parseInline(c.tokens)}</${tag}>`;
        const head = `<tr>${token.header.map((c) => cell(c, 'th')).join('')}</tr>`;
        const body = token.rows.map((r) => `<tr>${r.map((c) => cell(c, 'td')).join('')}</tr>`).join('');
        return `<div class="table-wrap"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
      },
      html() {
        return ''; // raw HTML in the docs (markers) is handled by segment()
      },
    },
  });
  return marked.parse(md, { async: false }) as string;
}

/** Tabbed code blocks; the chosen tab is remembered and shared by every group. */
function Tabs({ blocks, ctx }: { blocks: { label: string; lang: string; code: string }[]; ctx: RenderCtx }) {
  const labels = blocks.map((b) => b.label);
  const [active, setActive] = useState(() => {
    try {
      const saved = localStorage.getItem('sg-docs-tab');
      return saved && labels.includes(saved) ? saved : labels[0];
    } catch {
      return labels[0];
    }
  });
  const choose = (label: string) => {
    setActive(label);
    try {
      localStorage.setItem('sg-docs-tab', label);
    } catch {
      /* ignore */
    }
  };
  const block = blocks.find((b) => b.label === active) ?? blocks[0];
  const html = useMemo(() => codeBlock(ctx, block.code, block.lang, block.label), [block, ctx]);
  return (
    <div className="doc-tabs">
      <div className="doc-tab-bar" role="tablist">
        {blocks.map((b) => (
          <button key={b.label} type="button" role="tab" aria-selected={b.label === block.label} className={b.label === block.label ? 'on' : ''} onClick={() => choose(b.label)}>
            {b.label}
          </button>
        ))}
      </div>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

export function MarkdownPage({ md, file, apiBaseUrl }: { md: string; file: string; apiBaseUrl: string | null }) {
  const { parts, ctx } = useMemo(() => {
    const context: RenderCtx = { file, seen: new Map(), codes: [], apiBaseUrl };
    const rendered = segment(md).map((s) => (s.kind === 'md' ? { ...s, html: renderMarkdown(s.md, context) } : s));
    return { parts: rendered, ctx: context };
  }, [md, file, apiBaseUrl]);

  // Internal links navigate without a reload; copy buttons copy the (personalised) code.
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const copy = target.closest<HTMLButtonElement>('button[data-copy]');
    if (copy) {
      navigator.clipboard.writeText(ctx.codes[Number(copy.dataset.copy)] ?? '').then(() => {
        copy.textContent = 'Copied';
        setTimeout(() => (copy.textContent = 'Copy'), 1500);
      });
      return;
    }
    const link = target.closest<HTMLAnchorElement>('a[data-internal]');
    if (link && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
      e.preventDefault();
      navigate(link.dataset.internal!);
      const anchor = link.dataset.internal!.split('#')[1];
      requestAnimationFrame(() => (anchor ? document.getElementById(anchor)?.scrollIntoView() : window.scrollTo(0, 0)));
    }
  };

  return (
    <div className="prose" onClick={onClick}>
      {parts.map((p, i) =>
        p.kind === 'md' ? (
          <div key={i} dangerouslySetInnerHTML={{ __html: (p as { html: string }).html }} />
        ) : p.kind === 'tabs' ? (
          <Tabs key={i} blocks={p.blocks} ctx={ctx} />
        ) : (
          <Suspense key={i} fallback={<div className="doc-preview skeleton" style={{ height: 420 }} />}>
            <GamePreviewBlock gameId={p.gameId} />
          </Suspense>
        )
      )}
    </div>
  );
}
