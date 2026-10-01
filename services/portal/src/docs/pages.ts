/**
 * The docs pages: slug, title and the repo file each is built from. Shared by the docs site
 * (content.ts) and the build, which also publishes every page as plain Markdown at
 * /portal/docs/<slug>.md with an index at /portal/docs/llms.txt (vite.config.ts).
 */
export interface DocPageMeta {
  slug: string;
  title: string;
  section: 'Get started' | 'Guides' | 'Reference';
  /** The file in the repo (for "Edit on GitHub", link rewriting and the Markdown copy). */
  file: string;
  blurb: string;
}

export const PAGE_META: DocPageMeta[] = [
  { slug: 'quickstart', title: 'Quickstart', section: 'Get started', file: 'docs/QUICKSTART.md', blurb: 'A verified game in your app in about 10 minutes.' },
  { slug: 'keys', title: 'API keys', section: 'Get started', file: 'docs/KEYS_SETUP.md', blurb: 'Create, store and rotate keys; test keys.' },
  { slug: 'developer-guide', title: 'Developer guide', section: 'Guides', file: 'docs/DEVELOPER_GUIDE.md', blurb: 'React Native and web, components, configuration, reliability.' },
  { slug: 'design', title: 'Design and theming', section: 'Guides', file: 'docs/DESIGN_GUIDE.md', blurb: 'Presets, createTheme, tokens, motion, haptics, slots, custom views.' },
  { slug: 'games', title: 'Games', section: 'Guides', file: 'docs/GAMES.md', blurb: 'Rules, scoring and config for each game, with live previews.' },
  { slug: 'battles', title: 'Battles', section: 'Guides', file: 'docs/BATTLES.md', blurb: '2–16 players racing the same puzzle live.' },
  { slug: 'webhooks', title: 'Webhooks', section: 'Guides', file: 'docs/WEBHOOKS.md', blurb: 'Verified results pushed to your server, signed.' },
  { slug: 'quiz-banks', title: 'Quiz banks', section: 'Guides', file: 'docs/QUIZ_BANKS.md', blurb: 'Your own questions for Quiz Master.' },
  { slug: 'api', title: 'API reference', section: 'Reference', file: 'docs/openapi.yaml', blurb: 'Every endpoint, the battle WebSocket and webhooks.' },
  { slug: 'sdk', title: 'SDK reference', section: 'Reference', file: 'docs/SDK_REFERENCE.md', blurb: 'Provider props, components, hooks and helpers.' },
  { slug: 'architecture', title: 'Architecture and security', section: 'Reference', file: 'docs/ARCHITECTURE.md', blurb: 'How scores are verified and what the platform trusts.' },
  { slug: 'self-hosting', title: 'Self-hosting', section: 'Reference', file: 'docs/DEPLOYMENT.md', blurb: 'Run the platform anywhere: Docker, Railway, any SQL database.' },
  { slug: 'docker', title: 'Docker deployment', section: 'Reference', file: 'docs/DOCKER.md', blurb: 'Compose on a shared VPS: reverse proxy, limits, backups, rollback.' },
  { slug: 'moving-to-3', title: 'Moving a 2.x deployment', section: 'Reference', file: 'docs/MOVING_TO_3.md', blurb: 'Export the old deployment and import it into 3.0; keys keep working.' },
  { slug: 'troubleshooting', title: 'Troubleshooting and FAQ', section: 'Reference', file: 'docs/TROUBLESHOOTING.md', blurb: 'Common errors and what they mean.' },
  { slug: 'changelog', title: 'Changelog', section: 'Reference', file: 'CHANGELOG.md', blurb: 'What changed in each release.' },
];
