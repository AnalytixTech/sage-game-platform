/**
 * The docs site's pages. The Markdown lives in /docs (one source for GitHub and the portal) and is
 * bundled at build time.
 */
import quickstart from '../../../../docs/QUICKSTART.md?raw';
import keys from '../../../../docs/KEYS_SETUP.md?raw';
import developerGuide from '../../../../docs/DEVELOPER_GUIDE.md?raw';
import design from '../../../../docs/DESIGN_GUIDE.md?raw';
import battles from '../../../../docs/BATTLES.md?raw';
import webhooks from '../../../../docs/WEBHOOKS.md?raw';
import quizBanks from '../../../../docs/QUIZ_BANKS.md?raw';
import games from '../../../../docs/GAMES.md?raw';
import sdk from '../../../../docs/SDK_REFERENCE.md?raw';
import architecture from '../../../../docs/ARCHITECTURE.md?raw';
import deployment from '../../../../docs/DEPLOYMENT.md?raw';
import troubleshooting from '../../../../docs/TROUBLESHOOTING.md?raw';
import movingTo3 from '../../../../docs/MOVING_TO_3.md?raw';
import changelog from '../../../../CHANGELOG.md?raw';

import { DocPageMeta, PAGE_META } from './pages';

export interface DocPage extends DocPageMeta {
  /** Markdown source; absent for generated pages (the API reference). */
  md?: string;
}

const SOURCES: Record<string, string> = {
  quickstart,
  keys,
  'developer-guide': developerGuide,
  design,
  games,
  battles,
  webhooks,
  'quiz-banks': quizBanks,
  sdk,
  architecture,
  'self-hosting': deployment,
  'moving-to-3': movingTo3,
  troubleshooting,
  changelog,
};

export const PAGES: DocPage[] = PAGE_META.map((meta) => ({ ...meta, md: SOURCES[meta.slug] }));

export const REPO = 'https://github.com/AnalytixTech/sage-game-platform';

const bySlug = new Map(PAGES.map((p) => [p.slug, p]));
const byFile = new Map(PAGES.map((p) => [p.file, p]));

export const pageFor = (slug: string | undefined): DocPage | undefined => (slug ? bySlug.get(slug) : undefined);

/** Resolve a relative path against a repo file ("docs/A.md" + "../x/y.ts" → "x/y.ts"). */
export function resolvePath(from: string, rel: string): string {
  const parts = from.split('/').slice(0, -1);
  for (const seg of rel.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

/**
 * Where a Markdown link should go in the portal: another docs page (/docs/slug#anchor), an anchor
 * on this page, or the file on GitHub.
 */
export function rewriteLink(fromFile: string, href: string): { to: string; external: boolean } {
  if (/^(https?:|mailto:)/.test(href)) return { to: href, external: true };
  if (href.startsWith('#')) return { to: href, external: false };
  const [p, anchor] = href.split('#');
  const target = resolvePath(fromFile, p);
  const page = byFile.get(target);
  if (page) return { to: `/docs/${page.slug}${anchor ? `#${anchor}` : ''}`, external: false };
  return { to: `${REPO}/blob/main/${target}${anchor ? `#${anchor}` : ''}`, external: true };
}

/** GitHub-style heading anchors (same rule as tools/docs/check-docs.mjs). */
export const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_~]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s/g, '-');
