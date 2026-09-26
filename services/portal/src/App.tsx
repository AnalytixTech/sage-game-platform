import { lazy, ReactNode, Suspense, useEffect, useState } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { api, AppSummary, init, PortalConfig } from './api';
import { AuthPage, ResetPasswordPage } from './pages/Auth';
import { AppsPage } from './pages/Apps';
import { AppDetailPage, SECTIONS } from './pages/AppDetail';
import { Link, useRoute } from './router';
import { Icon, Skeleton, ToastProvider } from './ui';

const DocsApp = lazy(() => import('./docs/DocsApp'));

type ThemeMode = 'dark' | 'light' | 'system';

function useThemeMode(): [ThemeMode, () => void] {
  const [mode, setMode] = useState<ThemeMode>(() => {
    try {
      return (localStorage.getItem('sg-portal-theme') as ThemeMode) || 'dark';
    } catch {
      return 'dark';
    }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    try {
      localStorage.setItem('sg-portal-theme', mode);
    } catch {
      /* private mode */
    }
  }, [mode]);
  const next = () => setMode((m) => (m === 'dark' ? 'light' : m === 'light' ? 'system' : 'dark'));
  return [mode, next];
}

export function App() {
  const [ready, setReady] = useState<{ supabase: SupabaseClient; config: PortalConfig } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [recovering, setRecovering] = useState(false);
  const route = useRoute();
  const themeMode = useThemeMode();

  useEffect(() => {
    init()
      .then(async (r) => {
        const { data } = await r.supabase.auth.getSession();
        setSession(data.session);
        r.supabase.auth.onAuthStateChange((event, next) => {
          setSession(next);
          if (event === 'PASSWORD_RECOVERY') setRecovering(true);
        });
        setReady(r);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const inDocs = route[0] === 'docs';

  if (error && !inDocs) return <div className="center"><p className="error">{error}</p></div>;
  if (!ready && !inDocs) return <div className="center muted">Loading…</div>;

  // The docs are public: readable before signing up.
  if (inDocs) {
    return (
      <ToastProvider>
        <Suspense fallback={<div className="content"><Skeleton lines={6} /></div>}>
          <DocsApp route={route.slice(1)} signedIn={!!session} config={ready?.config ?? null} themeMode={themeMode} />
        </Suspense>
      </ToastProvider>
    );
  }

  const { supabase, config } = ready!;
  if (recovering) return <ResetPasswordPage supabase={supabase} onDone={() => setRecovering(false)} />;
  if (!session) return <AuthPage supabase={supabase} />;

  const appId = route[0] === 'apps' ? route[1] : undefined;
  const section = route[2] ?? 'overview';
  const page =
    appId !== undefined ? <AppDetailPage appId={appId} section={section} config={config} /> : <AppsPage />;

  return (
    <ToastProvider>
      <Shell email={session.user.email ?? ''} appId={appId} section={section} onSignOut={() => supabase.auth.signOut()} themeMode={themeMode}>
        {page}
      </Shell>
    </ToastProvider>
  );
}

function ThemeToggle({ themeMode: [mode, next] }: { themeMode: [ThemeMode, () => void] }) {
  return (
    <button className="nav-item" style={{ background: 'none', width: '100%', justifyContent: 'flex-start' }} onClick={next} title="Switch theme">
      <Icon name={mode === 'light' ? 'sun' : mode === 'dark' ? 'moon' : 'settings'} />
      {mode === 'light' ? 'Light' : mode === 'dark' ? 'Dark' : 'System'} theme
    </button>
  );
}

function Shell({
  email,
  appId,
  section,
  onSignOut,
  themeMode,
  children,
}: {
  email: string;
  appId?: string;
  section: string;
  onSignOut: () => void;
  themeMode: [ThemeMode, () => void];
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [app, setApp] = useState<AppSummary | null>(null);
  useEffect(() => setOpen(false), [appId, section]);
  useEffect(() => {
    if (!appId) return setApp(null);
    api<AppSummary>(`/apps/${appId}`).then(setApp).catch(() => setApp(null));
  }, [appId]);

  return (
    <div className="layout">
      <div className={`scrim ${open ? 'open' : ''}`} onClick={() => setOpen(false)} />
      <nav className={`sidebar ${open ? 'open' : ''}`} aria-label="Portal">
        <Link to="/" className="brand">
          <span className="brand-mark">◆</span>
          <span>
            SageGames
            <small>Developers</small>
          </span>
        </Link>
        <Link to="/" className={`nav-item ${!appId ? 'active' : ''}`}>
          <Icon name="apps" /> Your apps
        </Link>
        {appId && (
          <>
            <div className="nav-label">App</div>
            <div className="nav-app">
              <span className="dot">{(app?.name ?? '?').slice(0, 1).toUpperCase()}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app?.name ?? '…'}</span>
            </div>
            {SECTIONS.map(([id, label, icon]) => (
              <Link key={id} to={`/apps/${appId}/${id}`} className={`nav-item ${section === id ? 'active' : ''}`}>
                <Icon name={icon} /> {label}
              </Link>
            ))}
          </>
        )}
        <div className="nav-label">Learn</div>
        <Link to="/docs" className="nav-item">
          <Icon name="book" /> Documentation
        </Link>
        <div className="sidebar-foot">
          <ThemeToggle themeMode={themeMode} />
          <div className="account" title={email}>{email}</div>
          <button className="nav-item" style={{ background: 'none', width: '100%', justifyContent: 'flex-start' }} onClick={onSignOut}>
            <Icon name="logout" /> Sign out
          </button>
        </div>
      </nav>
      <div className="main">
        <div className="mobilebar">
          <button className="icon-button" aria-label="Menu" onClick={() => setOpen(true)}>
            <Icon name="menu" />
          </button>
          <span className="brand-mark" style={{ width: 26, height: 26 }}>◆</span>
          <strong>{app?.name ?? 'SageGames'}</strong>
        </div>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
