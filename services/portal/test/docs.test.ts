import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { pageFor, PAGES, rewriteLink, slugify } from '../src/docs/content';
import { highlight } from '../src/docs/highlight';
import { segment, tableOfContents } from '../src/docs/markdown';
import { search } from '../src/docs/search';
import { apiOperations } from '../src/docs/ApiReference';

const SRC = path.resolve(__dirname, '../src');
const sources = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? sources(path.join(dir, d.name)) : /\.tsx?$/.test(d.name) ? [path.join(dir, d.name)] : []));

const anchorsOf = (slug: string): Set<string> => {
  const page = pageFor(slug)!;
  if (page.md) return new Set(tableOfContents(page.md).map((h) => h.id).concat([...page.md.matchAll(/^#{1,6}\s+(.+)$/gm)].map(([, h]) => slugify(h))));
  return new Set(apiOperations().map((o) => o.id).concat(['battle-websocket', 'webhooks', 'sessions', 'battles']));
};

describe('docs site', () => {
  it('every /docs link in the portal points at a real page and heading', () => {
    const problems: string[] = [];
    for (const file of sources(SRC)) {
      const code = fs.readFileSync(file, 'utf8');
      for (const [, slug, anchor] of code.matchAll(/['"`]\/docs\/([a-z-]+)(?:#([a-z0-9-]+))?['"`]/g)) {
        if (!pageFor(slug)) problems.push(`${path.basename(file)}: no page /docs/${slug}`);
        else if (anchor && !anchorsOf(slug).has(anchor)) problems.push(`${path.basename(file)}: no #${anchor} on /docs/${slug}`);
      }
      for (const [, slug] of code.matchAll(/<Help doc="([a-z-]+)"/g)) if (!pageFor(slug)) problems.push(`${path.basename(file)}: Help links to missing /docs/${slug}`);
    }
    expect(problems).toEqual([]);
  });

  it('every page has content and a unique slug', () => {
    expect(new Set(PAGES.map((p) => p.slug)).size).toBe(PAGES.length);
    for (const p of PAGES) if (p.slug !== 'api') expect(p.md?.length).toBeGreaterThan(200);
  });

  it('rewrites Markdown links to docs pages, anchors, or GitHub', () => {
    expect(rewriteLink('docs/QUICKSTART.md', 'DESIGN_GUIDE.md#3-tokens')).toEqual({ to: '/docs/design#3-tokens', external: false });
    expect(rewriteLink('docs/QUICKSTART.md', '../CHANGELOG.md')).toEqual({ to: '/docs/changelog', external: false });
    expect(rewriteLink('docs/QUICKSTART.md', '#1-create-an-app-and-a-key')).toEqual({ to: '#1-create-an-app-and-a-key', external: false });
    expect(rewriteLink('docs/DEVELOPER_GUIDE.md', '../examples/host-backend/server.ts')).toEqual({ to: 'https://github.com/AnalytixTech/sage-game-platform/blob/main/examples/host-backend/server.ts', external: true });
    expect(rewriteLink('docs/X.md', 'https://example.com')).toEqual({ to: 'https://example.com', external: true });
  });

  it('splits tabs and live previews out of a page', () => {
    const parts = segment('intro\n<!-- tabs -->\n```bash React Native\nnpm i a\n```\n```bash Web\nnpm i b\n```\n<!-- /tabs -->\n<!-- preview:game_memory_001 -->\nend');
    expect(parts.map((p) => p.kind)).toEqual(['md', 'tabs', 'preview', 'md']);
    expect(parts[1]).toMatchObject({ blocks: [{ label: 'React Native', code: 'npm i a' }, { label: 'Web', code: 'npm i b' }] });
  });

  it('highlights without letting markup through', () => {
    const html = highlight('const a = "<script>alert(1)</script>"; // <b>', 'ts');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>');
    expect(html).toContain('<span class="tok-keyword">const</span>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('search finds sections by heading and text', () => {
    const hits = search('webhook signature');
    expect(hits[0]).toMatchObject({ slug: 'webhooks', anchor: 'verify-the-signature' });
    expect(search('zzzz nothing')).toEqual([]);
  });

  it('the API reference covers every operation in the spec', () => {
    const spec = parse(fs.readFileSync(path.resolve(__dirname, '../../../docs/openapi.yaml'), 'utf8')) as { paths: Record<string, object> };
    const count = Object.values(spec.paths).reduce((n, ops) => n + Object.keys(ops).filter((m) => ['get', 'post', 'put', 'patch', 'delete'].includes(m)).length, 0);
    expect(apiOperations()).toHaveLength(count);
  });
});
