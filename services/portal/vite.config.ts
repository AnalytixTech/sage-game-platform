import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { parse } from 'yaml';
import { PAGE_META } from './src/docs/pages';

/** `import spec from '…/openapi.yaml'` gives the parsed object (the browser gets JSON, no YAML parser). */
function yamlAsJson(): Plugin {
  return {
    name: 'yaml-as-json',
    transform(code, id) {
      if (!id.endsWith('.yaml') && !id.endsWith('.yml')) return null;
      return { code: `export default ${JSON.stringify(parse(code))};`, map: null };
    },
  };
}

/**
 * Publish the docs as plain Markdown next to the app, for people and tools that don't run
 * JavaScript: /portal/docs/<slug>.md for every page, the OpenAPI spec, and an index at
 * /portal/docs/llms.txt. Links between pages point at the .md copies.
 */
function markdownDocs(): Plugin {
  const repo = fileURLToPath(new URL('../..', import.meta.url));
  const bySource = new Map(PAGE_META.map((p) => [p.file, p]));
  const origin = process.env.PUBLIC_BASE_URL?.replace(/\/$/, '') ?? '';
  const url = (file: string) => `${origin}/portal/docs/${file}`;
  return {
    name: 'markdown-docs',
    apply: 'build',
    generateBundle() {
      const lines = ['# SageGames', '', '> Verified mini-games (Quiz, Memory, Sudoku, Word Search, Word Rush) and live battles for React Native and web apps.', ''];
      for (const section of ['Get started', 'Guides', 'Reference'] as const) {
        lines.push(`## ${section}`, '');
        for (const page of PAGE_META.filter((p) => p.section === section)) {
          const isSpec = page.file.endsWith('.yaml');
          const name = isSpec ? 'openapi.yaml' : `${page.slug}.md`;
          let source = fs.readFileSync(path.join(repo, page.file), 'utf8');
          if (!isSpec) {
            // [text](OTHER.md#anchor) → [text](other-slug.md#anchor), relative to the page's folder.
            source = source.replace(/\]\((?!https?:|mailto:|#)([^)#\s]+)(#[^)\s]*)?\)/g, (all, rel: string, anchor = '') => {
              const target = path.posix.normalize(path.posix.join(path.posix.dirname(page.file), rel));
              const linked = bySource.get(target);
              if (linked) return `](${linked.file.endsWith('.yaml') ? 'openapi.yaml' : `${linked.slug}.md`}${anchor})`;
              return `](https://github.com/AnalytixTech/sage-game-platform/blob/main/${target}${anchor})`;
            });
          }
          this.emitFile({ type: 'asset', fileName: `docs/${name}`, source });
          lines.push(`- [${page.title}](${url(name)}): ${page.blurb}`);
        }
        lines.push('');
      }
      this.emitFile({ type: 'asset', fileName: 'docs/llms.txt', source: lines.join('\n') });
    },
  };
}

// Served by the API at /portal. In development, API calls are proxied to a local API on :4000.
// The SDK packages resolve to their sources (tsconfig paths), like the playground, so the Theme
// Studio always previews the current code. The docs pages import the Markdown in /docs at build time.
export default defineConfig({
  base: '/portal/',
  plugins: [react(), yamlAsJson(), markdownDocs()],
  resolve: { tsconfigPaths: true },
  server: {
    port: 5173,
    proxy: { '/portal/api': 'http://localhost:4000', '/v2': 'http://localhost:4000' },
  },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1200 },
});
