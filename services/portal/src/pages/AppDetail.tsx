import { FormEvent, lazy, ReactNode, Suspense, useCallback, useEffect, useState } from 'react';
import { api, ApiKey, AppSummary, Game, json, listGames, PortalConfig, RecentResult, UsageDay, WebhookInfo } from '../api';
import { Link, navigate } from '../router';
import { CopyButton, EmptyState, Icon, IconName, Modal, Skeleton, Sparkline, useToast } from '../ui';
import { GamePicker } from './Apps';
import { QuizBanksTab } from './QuizBanks';

const DesignStudio = lazy(() => import('./DesignStudio'));

export const SECTIONS: [id: string, label: string, icon: IconName][] = [
  ['overview', 'Overview', 'overview'],
  ['keys', 'API keys', 'key'],
  ['games', 'Games', 'games'],
  ['webhook', 'Webhook', 'webhook'],
  ['quiz', 'Quiz banks', 'quiz'],
  ['design', 'Design', 'palette'],
  ['usage', 'Usage', 'chart'],
  ['settings', 'Settings', 'settings'],
];

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

type AppWithKeys = AppSummary & { keys: ApiKey[] };

/** "How this works" panel linking to the docs. */
function Help({ children, doc }: { children: ReactNode; doc: string }) {
  return (
    <div className="help">
      <Icon name="book" />
      <div>
        {children}{' '}
        <Link to={`/docs/${doc}`}>Read the guide →</Link>
      </div>
    </div>
  );
}

export function AppDetailPage({ appId, section, config }: { appId: string; section: string; config: PortalConfig }) {
  const [app, setApp] = useState<AppWithKeys | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    () =>
      api<AppWithKeys>(`/apps/${appId}`)
        .then(setApp)
        .catch((e: Error) => setError(e.message)),
    [appId]
  );
  useEffect(() => {
    reload();
  }, [reload]);

  if (error) return <p className="error">{error}</p>;
  if (!app) return <Skeleton lines={6} />;
  const current = SECTIONS.find(([id]) => id === section) ?? SECTIONS[0];

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <p className="label" style={{ margin: 0 }}>{app.name}</p>
          <h1>{current[1]}</h1>
        </div>
        <div className="row small muted">
          App ID <code>{app.id}</code> <CopyButton text={app.id} />
        </div>
      </div>

      {current[0] === 'overview' && <OverviewTab app={app} config={config} />}
      {current[0] === 'keys' && <KeysTab app={app} onChange={reload} />}
      {current[0] === 'games' && <GamesTab app={app} onChange={reload} />}
      {current[0] === 'webhook' && <WebhookTab appId={appId} />}
      {current[0] === 'quiz' && (
        <>
          <Help doc="quiz-banks">Your own question sets for Quiz Master, used with <code>config.bankId</code>.</Help>
          <QuizBanksTab appId={appId} />
        </>
      )}
      {current[0] === 'design' && (
        <Suspense fallback={<Skeleton lines={8} />}>
          <DesignStudio appId={appId} gameIds={app.gameIds} />
        </Suspense>
      )}
      {current[0] === 'usage' && <UsageTab appId={appId} />}
      {current[0] === 'settings' && <SettingsTab app={app} onChange={reload} />}
    </div>
  );
}

// ---------------------------------------------------------------- overview

function OverviewTab({ app, config }: { app: AppWithKeys; config: PortalConfig }) {
  const [days, setDays] = useState<UsageDay[] | null>(null);
  const [results, setResults] = useState<RecentResult[] | null>(null);
  useEffect(() => {
    api<{ daily: UsageDay[] }>(`/apps/${app.id}/usage?days=30`).then((u) => setDays(u.daily)).catch(() => setDays([]));
    api<RecentResult[]>(`/apps/${app.id}/results?limit=8`).then(setResults).catch(() => setResults([]));
  }, [app.id]);

  const totals = (days ?? []).reduce(
    (t, d) => ({ sessions: t.sessions + d.sessions, completed: t.completed + d.completed, verified: t.verified + d.verified }),
    { sessions: 0, completed: 0, verified: 0 }
  );
  const liveKey = app.keys.some((k) => k.mode === 'live' && !k.revokedAt);
  const steps: { done: boolean; title: string; body: ReactNode; to: string }[] = [
    { done: liveKey, title: 'Create a live API key', body: 'Your backend uses it to start game sessions.', to: `/apps/${app.id}/keys` },
    { done: totals.sessions > 0, title: 'Start your first session', body: 'Call POST /v2/sessions from your backend and open the game in your app.', to: '/docs/quickstart' },
    { done: totals.verified > 0, title: 'Get a verified score', body: 'Play a game to the end: the server replays it and records the score.', to: '/docs/quickstart#4-show-the-game' },
    { done: !!app.webhookUrl, title: 'Receive results by webhook', body: 'Optional: get every verified score pushed to your server.', to: `/apps/${app.id}/webhook` },
    { done: false, title: 'Make it look like your app', body: 'Pick a preset or your brand colour in the Theme Studio.', to: `/apps/${app.id}/design` },
  ];
  const done = steps.filter((s) => s.done).length;
  const series = (key: keyof Omit<UsageDay, 'day'>) => (days ?? []).map((d) => d[key]);

  return (
    <div className="stack-lg">
      <div className="stats">
        <div className="stat">
          <span className="label" style={{ margin: 0 }}>Sessions · 30 days</span>
          <strong>{days ? totals.sessions : '—'}</strong>
          <Sparkline values={series('sessions')} />
        </div>
        <div className="stat">
          <span className="label" style={{ margin: 0 }}>Completed</span>
          <strong>{days ? totals.completed : '—'}</strong>
          <Sparkline values={series('completed')} />
        </div>
        <div className="stat">
          <span className="label" style={{ margin: 0 }}>Verified scores</span>
          <strong>{days ? totals.verified : '—'}</strong>
          <Sparkline values={series('verified')} />
        </div>
      </div>

      <div className="card stack">
        <div className="row between">
          <h2>Get set up</h2>
          <span className="muted small">
            {done} of {steps.length} done
          </span>
        </div>
        <div className="progress">
          <div style={{ width: `${(done / steps.length) * 100}%` }} />
        </div>
        <div className="checklist">
          {steps.map((s) => (
            <div key={s.title} className={`check-item ${s.done ? 'done' : ''}`}>
              <span className="tick">
                <Icon name="check" size={14} />
              </span>
              <div className="check-body">
                <div className="check-title" style={{ fontWeight: 650 }}>{s.title}</div>
                <div className="muted small">{s.body}</div>
              </div>
              <Link to={s.to} className="small">
                {s.done ? 'View' : 'Start'} →
              </Link>
            </div>
          ))}
        </div>
      </div>

      <div className="card stack">
        <h2>Recent results</h2>
        {!results ? (
          <Skeleton lines={3} />
        ) : results.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>No games finished yet. Verified scores show up here as soon as players finish.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Player</th><th>Game</th><th>Score</th><th>Status</th><th>When</th></tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.sessionId}>
                    <td>{r.displayName ?? r.externalUserId}</td>
                    <td>{r.gameId}</td>
                    <td><strong>{r.score}</strong></td>
                    <td><span className={`badge ${r.valid ? 'ok' : r.status === 'rejected' ? 'failed' : 'pending'}`}>{r.valid ? 'verified' : r.isTest ? 'test' : r.status}</span></td>
                    <td className="muted small">{fmt(r.completedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Quickstart config={config} />
    </div>
  );
}

function Quickstart({ config }: { config: PortalConfig }) {
  const node = `// On your server only: never ship the API key in an app.
const res = await fetch('${config.apiBaseUrl}/v2/sessions', {
  method: 'POST',
  headers: {
    Authorization: \`Bearer \${process.env.SAGEGAMES_API_KEY}\`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ gameId, externalUserId: user.id, displayName: user.name, contextId }),
});
const { sessionId, sessionToken } = await res.json();
// Return only sessionId + sessionToken to your app; the SDK does the rest.`;
  return (
    <div className="card stack">
      <div className="row between">
        <h2>Quickstart</h2>
        <Link to="/docs/quickstart">Full quickstart →</Link>
      </div>
      <div className="code-block">
        <div className="row between">
          <span className="label" style={{ margin: 0 }}>Node.js (your backend)</span>
          <CopyButton text={node} />
        </div>
        <pre>{node}</pre>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- keys

function KeysTab({ app, onChange }: { app: AppWithKeys; onChange: () => void }) {
  const [label, setLabel] = useState('');
  const [mode, setMode] = useState<'live' | 'test'>('live');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<ApiKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const key = await api<ApiKey>(`/apps/${app.id}/keys`, { method: 'POST', body: json({ label, mode }) });
      setCreating(false);
      setCreated(key);
      setLabel('');
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the key');
    }
  };

  const revoke = async (key: ApiKey) => {
    if (!window.confirm(`Revoke "${key.label || key.preview}"? Anything using it stops working immediately.`)) return;
    try {
      await api(`/apps/${app.id}/keys/${key.id}`, { method: 'DELETE' });
      toast('Key revoked');
      onChange();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not revoke the key', 'error');
    }
  };

  return (
    <div className="stack">
      <Help doc="keys">Keys belong on your backend only. Test keys work the same but never reach leaderboards or webhooks.</Help>
      <div className="row between">
        <span className="muted small">{app.keys.filter((k) => !k.revokedAt).length} active keys</span>
        <button className="primary" onClick={() => setCreating(true)}>
          <Icon name="plus" size={16} /> Create key
        </button>
      </div>

      {app.keys.length === 0 ? (
        <EmptyState icon="key" title="No keys yet">
          <p className="muted" style={{ margin: 0 }}>Create a live key for production and a test key for staging.</p>
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Key</th><th>Label</th><th>Created</th><th>Last used</th><th /></tr>
            </thead>
            <tbody>
              {app.keys.map((k) => (
                <tr key={k.id} className={k.revokedAt ? 'revoked' : ''}>
                  <td><code>{k.preview}</code> <span className={`badge ${k.mode}`}>{k.mode}</span></td>
                  <td>{k.label || <span className="muted">—</span>}</td>
                  <td className="small">{fmt(k.createdAt)}</td>
                  <td className="small">{fmt(k.lastUsedAt)}</td>
                  <td className="right">
                    {k.revokedAt ? <span className="muted small">Revoked</span> : <button className="danger small" onClick={() => revoke(k)}>Revoke</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Create an API key">
        <form className="stack" onSubmit={create}>
          {error && <p className="error">{error}</p>}
          <label>
            Label
            <input value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. production server" />
          </label>
          <label>
            Mode
            <select value={mode} onChange={(e) => setMode(e.target.value as 'live' | 'test')}>
              <option value="live">Live</option>
              <option value="test">Test (never on leaderboards)</option>
            </select>
          </label>
          <div className="row">
            <button className="primary">Create key</button>
            <button type="button" className="ghost" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!created?.key} onClose={() => setCreated(null)} title="Copy your new key now" dismissable={false}>
        <p style={{ margin: 0 }}>
          This is the only time it will be shown. Store it in your backend's environment (for example <code>SAGEGAMES_API_KEY</code>), never in a mobile or web app.
        </p>
        <div className="row">
          <code className="secret">{created?.key}</code>
          {created?.key && <CopyButton text={created.key} />}
        </div>
        <button className="primary" onClick={() => setCreated(null)}>
          <Icon name="check" size={16} /> I've stored it
        </button>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------- games

function GamesTab({ app, onChange }: { app: AppSummary; onChange: () => void }) {
  const [games, setGames] = useState<Game[]>([]);
  const [selected, setSelected] = useState(app.gameIds);
  const toast = useToast();
  useEffect(() => {
    listGames().then(setGames);
  }, []);
  const save = async () => {
    try {
      await api(`/apps/${app.id}`, { method: 'PATCH', body: json({ gameIds: selected }) });
      toast('Games saved');
      onChange();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save', 'error');
    }
  };
  const changed = [...selected].sort().join() !== [...app.gameIds].sort().join();
  return (
    <div className="stack">
      <p className="muted" style={{ margin: 0 }}>Sessions and battles can only be created for the games enabled here.</p>
      <GamePicker games={games} selected={selected} onChange={setSelected} />
      <div className="row">
        <button className="primary" onClick={save} disabled={!changed}>Save games</button>
        {changed && <span className="muted small">Unsaved changes</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- webhook

function WebhookTab({ appId }: { appId: string }) {
  const [info, setInfo] = useState<WebhookInfo | null>(null);
  const [url, setUrl] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const toast = useToast();

  const load = useCallback(
    () =>
      api<WebhookInfo>(`/apps/${appId}/webhook`).then((w) => {
        setInfo(w);
        setUrl(w.url ?? '');
      }),
    [appId]
  );
  useEffect(() => {
    load();
  }, [load]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api(`/apps/${appId}/webhook`, { method: 'PUT', body: json({ url: url.trim() || null }) });
      toast(url.trim() ? 'Webhook saved' : 'Webhook removed');
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save', 'error');
    }
  };

  const rotate = async () => {
    if (!window.confirm('Rotate the signing secret? Update your server before the next delivery.')) return;
    await api(`/apps/${appId}/webhook/rotate-secret`, { method: 'POST' });
    setShowSecret(true);
    toast('Secret rotated');
    await load();
  };

  if (!info) return <Skeleton lines={5} />;

  return (
    <div className="stack">
      <Help doc="webhooks">
        We POST <code>session.completed</code> and <code>match.finished</code> events here, signed with a <code>Sage-Signature</code> header.
      </Help>
      <form className="card row wrap" onSubmit={save}>
        <label className="grow">
          Endpoint URL
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.yourapp.com/webhooks/sagegames" />
        </label>
        <button className="primary">Save</button>
      </form>

      {info.secret && (
        <div className="card stack">
          <p className="label">Signing secret</p>
          <div className="row wrap" style={{ alignItems: 'center' }}>
            <code className="secret">{showSecret ? info.secret : 'whsec_••••••••••••••••'}</code>
            <button className="ghost small" onClick={() => setShowSecret((s) => !s)}>{showSecret ? 'Hide' : 'Reveal'}</button>
            {showSecret && <CopyButton text={info.secret} />}
            <button className="ghost small" onClick={rotate}>Rotate</button>
          </div>
        </div>
      )}

      <h2>Recent deliveries</h2>
      {info.recentDeliveries.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>No deliveries yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Event</th><th>Status</th><th>Attempts</th><th>Created</th><th>Last error</th></tr>
            </thead>
            <tbody>
              {info.recentDeliveries.map((d) => (
                <tr key={d.id}>
                  <td><code>{d.event}</code></td>
                  <td><span className={`badge ${d.status}`}>{d.status}</span></td>
                  <td>{d.attempts}</td>
                  <td className="small">{fmt(d.createdAt)}</td>
                  <td className="muted small">{d.lastError ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- usage

function UsageTab({ appId }: { appId: string }) {
  const [days, setDays] = useState<UsageDay[] | null>(null);
  useEffect(() => {
    api<{ daily: UsageDay[] }>(`/apps/${appId}/usage?days=30`).then((u) => setDays(u.daily));
  }, [appId]);
  if (!days) return <Skeleton lines={6} />;
  if (days.length === 0) {
    return (
      <EmptyState icon="chart" title="No sessions yet">
        <p className="muted" style={{ margin: 0 }}>Usage appears here once your backend starts sessions.</p>
      </EmptyState>
    );
  }
  const max = Math.max(1, ...days.map((d) => d.sessions));
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Day</th><th>Sessions</th><th>Completed</th><th>Verified</th></tr></thead>
        <tbody>
          {days.slice().reverse().map((d) => (
            <tr key={d.day}>
              <td>{d.day}</td>
              <td><span className="bar" style={{ width: `${(d.sessions / max) * 120}px` }} /> {d.sessions}</td>
              <td>{d.completed}</td>
              <td>{d.verified}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- settings

function SettingsTab({ app, onChange }: { app: AppSummary; onChange: () => void }) {
  const [name, setName] = useState(app.name);
  const [confirm, setConfirm] = useState('');
  const toast = useToast();
  const rename = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api(`/apps/${app.id}`, { method: 'PATCH', body: json({ name }) });
      toast('App renamed');
      onChange();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not rename', 'error');
    }
  };
  const remove = async () => {
    await api(`/apps/${app.id}`, { method: 'DELETE' });
    toast('App deleted');
    navigate('/');
  };
  if (app.role !== 'owner') return <p className="muted">Only the app owner can change these settings.</p>;
  return (
    <div className="stack-lg">
      <form className="card row wrap" onSubmit={rename}>
        <label className="grow">
          App name
          <input value={name} minLength={2} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </label>
        <button className="primary" disabled={name.trim() === app.name || name.trim().length < 2}>Rename</button>
      </form>
      <div className="card danger-zone stack">
        <h2>Delete this app</h2>
        <p style={{ margin: 0 }}>This revokes every key and deletes its sessions, results and leaderboards. It cannot be undone.</p>
        <label>
          Type <strong>{app.name}</strong> to confirm
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        <div>
          <button className="danger" disabled={confirm !== app.name} onClick={remove}>Delete app</button>
        </div>
      </div>
    </div>
  );
}
