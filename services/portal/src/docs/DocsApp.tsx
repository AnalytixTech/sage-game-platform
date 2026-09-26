import { useEffect, useMemo, useRef, useState } from 'react';
import type { PortalConfig } from '../api';
import { Link, navigate } from '../router';
import { Icon } from '../ui';
import { ApiReference, apiOperations } from './ApiReference';
import { DocPage, pageFor, PAGES, REPO } from './content';
import { MarkdownPage, tableOfContents } from './markdown';
import { search, SearchHit } from './search';

type ThemeMode = [string, () => void];

const SECTIONS = ['Get started', 'Guides', 'Reference'] as const;

/** Extra search entries for the generated API reference. */
const apiEntries = () =>
  apiOperations().map(({ method, path, op, id }) => ({
    slug: 'api',
    page: 'API reference',
    heading: `${method.toUpperCase()} ${path}`,
    anchor: id,
    text: `${op.summary ?? ''} ${op.description ?? ''}`,
  }));

function SearchBox() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const extra = useMemo(apiEntries, []);
  const hits: SearchHit[] = useMemo(() => search(q, 8, extra), [q, extra]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        input.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const go = (h: SearchHit) => {
    setOpen(false);
    setQ('');
    navigate(`/docs/${h.slug}${h.anchor ? `#${h.anchor}` : ''}`);
    requestAnimationFrame(() => (h.anchor ? document.getElementById(h.anchor)?.scrollIntoView() : window.scrollTo(0, 0)));
  };

  return (
    <div className="doc-search">
      <Icon name="search" size={16} className="doc-search-icon" />
      <input
        ref={input}
        value={q}
        placeholder="Search docs  ( / )"
        aria-label="Search the documentation"
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, hits.length - 1));
          else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
          else if (e.key === 'Enter' && hits[active]) go(hits[active]);
          else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && q.trim().length > 1 && (
        <div className="doc-search-results" role="listbox">
          {hits.length === 0 ? (
            <div className="muted small" style={{ padding: 12 }}>No results for “{q}”</div>
          ) : (
            hits.map((h, i) => (
              <button key={`${h.slug}-${h.anchor}-${i}`} type="button" role="option" aria-selected={i === active} className={i === active ? 'on' : ''} onMouseDown={() => go(h)}>
                <span className="hit-title">{h.heading}</span>
                <span className="hit-page">{h.page}</span>
                <span className="hit-snippet">{h.snippet}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function DocsHome() {
  return (
    <div className="prose">
      <h1>SageGames documentation</h1>
      <p className="lead">Five polished games for your app, scores the server verifies, live battles, and a design system you control. Start with the quickstart, or jump to what you need.</p>
      {SECTIONS.map((section) => (
        <section key={section}>
          <h2>{section}</h2>
          <div className="doc-cards">
            {PAGES.filter((p) => p.section === section).map((p) => (
              <Link key={p.slug} to={`/docs/${p.slug}`} className="doc-card">
                <strong>{p.title}</strong>
                <span className="muted small">{p.blurb}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function PageFooter({ page }: { page: DocPage }) {
  const i = PAGES.indexOf(page);
  const prev = PAGES[i - 1];
  const next = PAGES[i + 1];
  const issue = `${REPO}/issues/new?title=${encodeURIComponent(`Docs: ${page.title}`)}&body=${encodeURIComponent(`Page: /docs/${page.slug}\n\nWhat was missing or unclear?\n`)}`;
  return (
    <footer className="doc-footer">
      <div className="row between wrap">
        <span className="muted small">
          Was this page helpful? <a href={issue} target="_blank" rel="noopener noreferrer">Tell us what's missing</a>
        </span>
        <a className="small" href={`${REPO}/blob/main/${page.file}`} target="_blank" rel="noopener noreferrer">Edit on GitHub</a>
      </div>
      <div className="doc-pager">
        {prev ? <Link to={`/docs/${prev.slug}`} className="doc-card"><span className="muted small">Previous</span><strong>{prev.title}</strong></Link> : <span />}
        {next ? <Link to={`/docs/${next.slug}`} className="doc-card" style={{ textAlign: 'right' }}><span className="muted small">Next</span><strong>{next.title}</strong></Link> : <span />}
      </div>
    </footer>
  );
}

export default function DocsApp({ route, signedIn, config, themeMode: [mode, nextTheme] }: { route: string[]; signedIn: boolean; config: PortalConfig | null; themeMode: ThemeMode }) {
  const page = pageFor(route[0]);
  const [open, setOpen] = useState(false);
  const toc = useMemo(() => (page?.md ? tableOfContents(page.md) : []), [page]);

  useEffect(() => {
    setOpen(false);
    document.title = page ? `${page.title} · SageGames docs` : 'SageGames docs';
  }, [page]);

  // Deep links (/docs/battles#seats) scroll once the page has rendered.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
  }, [page]);

  const apiBaseUrl = signedIn ? config?.apiBaseUrl ?? null : null;

  return (
    <div className="layout docs-layout">
      <div className={`scrim ${open ? 'open' : ''}`} onClick={() => setOpen(false)} />
      <nav className={`sidebar ${open ? 'open' : ''}`} aria-label="Documentation">
        <Link to="/docs" className="brand">
          <span className="brand-mark">◆</span>
          <span>
            SageGames
            <small>Documentation</small>
          </span>
        </Link>
        <SearchBox />
        {SECTIONS.map((section) => (
          <div key={section}>
            <div className="nav-label">{section}</div>
            {PAGES.filter((p) => p.section === section).map((p) => (
              <Link key={p.slug} to={`/docs/${p.slug}`} className={`nav-item ${page?.slug === p.slug ? 'active' : ''}`}>
                {p.title}
              </Link>
            ))}
          </div>
        ))}
        <div className="sidebar-foot">
          <button className="nav-item" style={{ background: 'none', width: '100%', justifyContent: 'flex-start' }} onClick={nextTheme}>
            <Icon name={mode === 'light' ? 'sun' : mode === 'dark' ? 'moon' : 'settings'} /> {mode === 'light' ? 'Light' : mode === 'dark' ? 'Dark' : 'System'} theme
          </button>
          <Link to="/" className="nav-item">
            <Icon name="apps" /> {signedIn ? 'Back to your apps' : 'Sign in to the portal'}
          </Link>
        </div>
      </nav>
      <div className="main">
        <div className="mobilebar">
          <button className="icon-button" aria-label="Menu" onClick={() => setOpen(true)}>
            <Icon name="menu" />
          </button>
          <span className="brand-mark" style={{ width: 26, height: 26 }}>◆</span>
          <strong>{page?.title ?? 'Documentation'}</strong>
        </div>
        <div className="docs-body">
          <main className="docs-content">
            {signedIn && apiBaseUrl && (
              <div className="help small" style={{ marginBottom: 16 }}>
                <Icon name="check" size={16} />
                <span>
                  Code samples use your API URL. Your API key never appears here: keep it in <code>SAGEGAMES_API_KEY</code> on your server.
                </span>
              </div>
            )}
            {!page ? (
              route[0] ? (
                <div className="prose">
                  <h1>Page not found</h1>
                  <p>
                    <Link to="/docs">Back to the documentation</Link>
                  </p>
                </div>
              ) : (
                <DocsHome />
              )
            ) : page.slug === 'api' ? (
              <ApiReference apiBaseUrl={apiBaseUrl} />
            ) : (
              <MarkdownPage md={page.md!} file={page.file} apiBaseUrl={apiBaseUrl} />
            )}
            {page && <PageFooter page={page} />}
          </main>
          {toc.length > 1 && (
            <aside className="docs-toc" aria-label="On this page">
              <p className="label">On this page</p>
              {toc.map((h) => (
                <a key={h.id} href={`#${h.id}`} className={h.depth === 3 ? 'sub' : ''}>
                  {h.text}
                </a>
              ))}
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
