import { useEffect, useState } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { init, PortalConfig } from './api';
import { AuthPage, ResetPasswordPage } from './pages/Auth';
import { AppsPage } from './pages/Apps';
import { AppDetailPage } from './pages/AppDetail';

/** Minimal hash router: #/ (apps) and #/apps/:id/:tab */
function useRoute(): string[] {
  const read = () => window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function App() {
  const [ready, setReady] = useState<{ supabase: SupabaseClient; config: PortalConfig } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [recovering, setRecovering] = useState(false);
  const route = useRoute();

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

  if (error) return <div className="center"><p className="error">{error}</p></div>;
  if (!ready) return <div className="center muted">Loading…</div>;

  const { supabase } = ready;

  let page;
  if (recovering) {
    page = <ResetPasswordPage supabase={supabase} onDone={() => setRecovering(false)} />;
  } else if (!session) {
    page = <AuthPage supabase={supabase} />;
  } else if (route[0] === 'apps' && route[1]) {
    page = <AppDetailPage appId={route[1]} tab={route[2] ?? 'keys'} config={ready.config} />;
  } else {
    page = <AppsPage />;
  }

  return (
    <div className="shell">
      <header className="topbar">
        <a href="#/" className="brand">
          <span className="logo" aria-hidden>◆</span> SageGames <span className="muted">Developers</span>
        </a>
        {session && (
          <div className="topbar-right">
            <span className="muted small">{session.user.email}</span>
            <button className="ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
          </div>
        )}
      </header>
      <main className="content">{page}</main>
    </div>
  );
}
