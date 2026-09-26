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
import changelog from '../../../../CHANGELOG.md?raw';

export interface DocPage {
  slug: string;
  title: string;
  section: 'Get started' | 'Guides' | 'Reference';
  /** Markdown source; absent for generated pages (the API reference). */
  md?: string;
  /** The file in the repo (for "Edit on GitHub" and link rewriting). */
  file: string;
  blurb: string;
}

export const PAGES: DocPage[] = [
  { slug: 'quickstart', title: 'Quickstart', section: 'Get started', md: quickstart, file: 'docs/QUICKSTART.md', blurb: 'A verified game in your app in about 10 minutes.' },
  { slug: 'keys', title: 'API keys', section: 'Get started', md: keys, file: 'docs/KEYS_SETUP.md', blurb: 'Create, store and rotate keys; test keys.' },
  { slug: 'developer-guide', title: 'Developer guide', section: 'Guides', md: developerGuide, file: 'docs/DEVELOPER_GUIDE.md', blurb: 'React Native and web, components, configuration, reliability.' },
  { slug: 'design', title: 'Design and theming', section: 'Guides', md: design, file: 'docs/DESIGN_GUIDE.md', blurb: 'Presets, createTheme, tokens, motion, haptics, slots, custom views.' },
  { slug: 'games', title: 'Games', section: 'Guides', md: games, file: 'docs/GAMES.md', blurb: 'Rules, scoring and config for each game, with live previews.' },
  { slug: 'battles', title: 'Battles', section: 'Guides', md: battles, file: 'docs/BATTLES.md', blurb: '2–16 players racing the same puzzle live.' },
  { slug: 'webhooks', title: 'Webhooks', section: 'Guides', md: webhooks, file: 'docs/WEBHOOKS.md', blurb: 'Verified results pushed to your server, signed.' },
  { slug: 'quiz-banks', title: 'Quiz banks', section: 'Guides', md: quizBanks, file: 'docs/QUIZ_BANKS.md', blurb: 'Your own questions for Quiz Master.' },
  { slug: 'api', title: 'API reference', section: 'Reference', file: 'docs/openapi.yaml', blurb: 'Every endpoint, the battle WebSocket and webhooks.' },
  { slug: 'sdk', title: 'SDK reference', section: 'Reference', md: sdk, file: 'docs/SDK_REFERENCE.md', blurb: 'Provider props, components, hooks and helpers.' },
  { slug: 'architecture', title: 'Architecture and security', section: 'Reference', md: architecture, file: 'docs/ARCHITECTURE.md', blurb: 'How scores are verified and what the platform trusts.' },
  { slug: 'self-hosting', title: 'Self-hosting', section: 'Reference', md: deployment, file: 'docs/DEPLOYMENT.md', blurb: 'Run the platform on Supabase and Render.' },
  { slug: 'troubleshooting', title: 'Troubleshooting and FAQ', section: 'Reference', md: troubleshooting, file: 'docs/TROUBLESHOOTING.md', blurb: 'Common errors and what they mean.' },
  { slug: 'changelog', title: 'Changelog', section: 'Reference', md: changelog, file: 'CHANGELOG.md', blurb: 'What changed in each release.' },
];

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
