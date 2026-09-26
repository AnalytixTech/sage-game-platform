/** Client-side docs search: sections (page + heading + text), ranked by where the words match. */
import { PAGES, slugify } from './content';

export interface SearchHit {
  slug: string;
  page: string;
  heading: string;
  anchor: string;
  snippet: string;
  score: number;
}

interface Section {
  slug: string;
  page: string;
  heading: string;
  anchor: string;
  text: string;
}

const plain = (md: string) =>
  md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_>#|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

let index: Section[] | null = null;

export function buildIndex(extra: Section[] = []): Section[] {
  const sections: Section[] = [];
  for (const page of PAGES) {
    if (!page.md) continue;
    const parts = page.md.split(/^(#{1,3}\s+.+)$/m);
    let heading = page.title;
    let anchor = '';
    for (const part of parts) {
      const h = /^#{1,3}\s+(.+)$/.exec(part);
      if (h) {
        heading = h[1].replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/`/g, '');
        anchor = part.startsWith('# ') ? '' : slugify(h[1]);
        continue;
      }
      const text = plain(part);
      if (text) sections.push({ slug: page.slug, page: page.title, heading, anchor, text });
    }
  }
  return [...sections, ...extra];
}

export function search(query: string, limit = 8, extra: Section[] = []): SearchHit[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return [];
  index ??= buildIndex(extra);
  const hits: SearchHit[] = [];
  for (const s of index) {
    const heading = s.heading.toLowerCase();
    const page = s.page.toLowerCase();
    const text = s.text.toLowerCase();
    let score = 0;
    for (const w of words) {
      const inHeading = heading.includes(w);
      const inText = text.includes(w);
      if (!inHeading && !inText && !page.includes(w)) {
        score = 0;
        break; // every word must match somewhere
      }
      score += (inHeading ? 5 : 0) + (page.includes(w) ? 2 : 0) + (inText ? 1 : 0);
    }
    if (!score) continue;
    const at = Math.max(0, text.indexOf(words[0]) - 40);
    const snippet = (at > 0 ? '…' : '') + s.text.slice(at, at + 140) + (s.text.length > at + 140 ? '…' : '');
    hits.push({ slug: s.slug, page: s.page, heading: s.heading, anchor: s.anchor, snippet, score });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
