import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, ApiKey, AppSummary, Game, json, listGames, PortalConfig, UsageDay, WebhookInfo } from '../api';
import { GamePicker } from './Apps';

const TABS = [
  ['keys', 'API keys'],
  ['games', 'Games'],
  ['webhook', 'Webhook'],
  ['usage', 'Usage'],
  ['quickstart', 'Quickstart'],
] as const;

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="ghost small"
      onClick={() => navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export function AppDetailPage({ appId, tab, config }: { appId: string; tab: string; config: PortalConfig }) {
  const [app, setApp] = useState<(AppSummary & { keys: ApiKey[] }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    () =>
      api<AppSummary & { keys: ApiKey[] }>(`/apps/${appId}`)
        .then(setApp)
        .catch((e: Error) => setError(e.message)),
    [appId]
  );

  useEffect(() => {
    reload();
  }, [reload]);

  if (error) return <p className="error">{error}</p>;
  if (!app) return <p className="muted">Loading…</p>;

  return (
    <div className="stack-lg">
      <div>
        <a href="#/" className="muted small">← All apps</a>
        <h1>{app.name}</h1>
        <p className="muted small">App ID <code>{app.id}</code></p>
      </div>

      <nav className="tabs">
        {TABS.map(([id, label]) => (
          <a key={id} href={`#/apps/${appId}/${id}`} className={tab === id ? 'active' : ''}>
            {label}
          </a>
        ))}
      </nav>

      {tab === 'keys' && <KeysTab app={app} onChange={reload} />}
      {tab === 'games' && <GamesTab app={app} onChange={reload} />}
      {tab === 'webhook' && <WebhookTab appId={appId} />}
      {tab === 'usage' && <UsageTab appId={appId} />}
      {tab === 'quickstart' && <QuickstartTab config={config} />}
      {tab === 'settings' && <SettingsTab app={app} />}
      <p className="small">
        <a href={`#/apps/${appId}/settings`} className="muted">App settings</a>
      </p>
    </div>
  );
}

function KeysTab({ app, onChange }: { app: AppSummary & { keys: ApiKey[] }; onChange: () => void }) {
  const [label, setLabel] = useState('');
  const [mode, setMode] = useState<'live' | 'test'>('live');
  const [created, setCreated] = useState<ApiKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      setCreated(await api<ApiKey>(`/apps/${app.id}/keys`, { method: 'POST', body: json({ label, mode }) }));
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
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke the key');
    }
  };

  return (
    <div className="stack">
      {created?.key && (
        <div className="card reveal stack">
          <h2>Copy your new key now</h2>
          <p>This is the only time it will be shown. Store it in your backend's environment variables — never in a mobile or web app.</p>
          <div className="row">
            <code className="secret">{created.key}</code>
            <CopyButton text={created.key} />
          </div>
          <button className="ghost" onClick={() => setCreated(null)}>I've stored it</button>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <form className="card row wrap" onSubmit={create}>
        <label className="grow">
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
        <button className="primary">Create key</button>
      </form>

      <table>
        <thead>
          <tr><th>Key</th><th>Label</th><th>Created</th><th>Last used</th><th /></tr>
        </thead>
        <tbody>
          {app.keys.length === 0 && (
            <tr><td colSpan={5} className="muted">No keys yet.</td></tr>
          )}
          {app.keys.map((k) => (
            <tr key={k.id} className={k.revokedAt ? 'revoked' : ''}>
              <td><code>{k.preview}</code> <span className={`badge ${k.mode}`}>{k.mode}</span></td>
              <td>{k.label || <span className="muted">—</span>}</td>
              <td>{fmt(k.createdAt)}</td>
              <td>{fmt(k.lastUsedAt)}</td>
              <td className="right">
                {k.revokedAt ? <span className="muted small">Revoked</span> : <button className="danger small" onClick={() => revoke(k)}>Revoke</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GamesTab({ app, onChange }: { app: AppSummary; onChange: () => void }) {
  const [games, setGames] = useState<Game[]>([]);
  const [selected, setSelected] = useState(app.gameIds);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    listGames().then(setGames);
  }, []);

  const save = async () => {
    await api(`/apps/${app.id}`, { method: 'PATCH', body: json({ gameIds: selected }) });
    setSaved(true);
    onChange();
  };

  return (
    <div className="stack">
      <p className="muted">Sessions can only be created for the games enabled here.</p>
      <GamePicker games={games} selected={selected} onChange={(ids) => { setSelected(ids); setSaved(false); }} />
      <div className="row">
        <button className="primary" onClick={save}>Save games</button>
        {saved && <span className="muted small">Saved</span>}
      </div>
    </div>
  );
}

function WebhookTab({ appId }: { appId: string }) {
  const [info, setInfo] = useState<WebhookInfo | null>(null);
  const [url, setUrl] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    try {
      await api(`/apps/${appId}/webhook`, { method: 'PUT', body: json({ url: url.trim() || null }) });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    }
  };

  const rotate = async () => {
    if (!window.confirm('Rotate the signing secret? Update your server before the next delivery.')) return;
    await api(`/apps/${appId}/webhook/rotate-secret`, { method: 'POST' });
    setShowSecret(true);
    await load();
  };

  if (!info) return <p className="muted">Loading…</p>;

  return (
    <div className="stack">
      <p className="muted">
        We POST <code>session.completed</code> events here with the verified score, signed with a <code>Sage-Signature</code> header.
      </p>
      {error && <p className="error">{error}</p>}
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
          <div className="row">
            <code className="secret">{showSecret ? info.secret : 'whsec_••••••••••••••••'}</code>
            <button className="ghost small" onClick={() => setShowSecret((s) => !s)}>{showSecret ? 'Hide' : 'Reveal'}</button>
            {showSecret && <CopyButton text={info.secret} />}
            <button className="ghost small" onClick={rotate}>Rotate</button>
          </div>
        </div>
      )}

      <h2>Recent deliveries</h2>
      <table>
        <thead>
          <tr><th>Event</th><th>Status</th><th>Attempts</th><th>Created</th><th>Last error</th></tr>
        </thead>
        <tbody>
          {info.recentDeliveries.length === 0 && <tr><td colSpan={5} className="muted">No deliveries yet.</td></tr>}
          {info.recentDeliveries.map((d) => (
            <tr key={d.id}>
              <td><code>{d.event}</code></td>
              <td><span className={`badge ${d.status}`}>{d.status}</span></td>
              <td>{d.attempts}</td>
              <td>{fmt(d.createdAt)}</td>
              <td className="muted small">{d.lastError ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UsageTab({ appId }: { appId: string }) {
  const [days, setDays] = useState<UsageDay[] | null>(null);
  useEffect(() => {
    api<{ daily: UsageDay[] }>(`/apps/${appId}/usage?days=30`).then((u) => setDays(u.daily));
  }, [appId]);

  if (!days) return <p className="muted">Loading…</p>;
  const totals = days.reduce(
    (t, d) => ({ sessions: t.sessions + d.sessions, completed: t.completed + d.completed, verified: t.verified + d.verified }),
    { sessions: 0, completed: 0, verified: 0 }
  );
  const max = Math.max(1, ...days.map((d) => d.sessions));

  return (
    <div className="stack">
      <div className="stats">
        <div className="stat"><span className="muted small">Sessions (30 days)</span><strong>{totals.sessions}</strong></div>
        <div className="stat"><span className="muted small">Completed</span><strong>{totals.completed}</strong></div>
        <div className="stat"><span className="muted small">Verified scores</span><strong>{totals.verified}</strong></div>
      </div>
      {days.length === 0 ? (
        <p className="muted">No sessions yet.</p>
      ) : (
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
      )}
    </div>
  );
}

function QuickstartTab({ config }: { config: PortalConfig }) {
  const curl = `curl -X POST ${config.apiBaseUrl}/v2/sessions \\
  -H "Authorization: Bearer $SAGEGAMES_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"gameId":"game_memory_001","externalUserId":"user_123","displayName":"Ada","contextId":"group:42"}'`;
  const node = `// On your server only — never ship the API key in an app.
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
    <div className="stack">
      <ol className="steps">
        <li>Create a <strong>live</strong> API key and store it on your backend as <code>SAGEGAMES_API_KEY</code>.</li>
        <li>Add an endpoint on your backend that starts a game session for the signed-in user.</li>
        <li>Pass the <code>sessionToken</code> to your app and render the game with the SageGames SDK.</li>
        <li>Optionally add a webhook to receive verified scores.</li>
      </ol>
      <div className="code-block"><div className="row between"><span className="label">curl</span><CopyButton text={curl} /></div><pre>{curl}</pre></div>
      <div className="code-block"><div className="row between"><span className="label">Node.js</span><CopyButton text={node} /></div><pre>{node}</pre></div>
    </div>
  );
}

function SettingsTab({ app }: { app: AppSummary }) {
  const [confirm, setConfirm] = useState('');
  const remove = async () => {
    await api(`/apps/${app.id}`, { method: 'DELETE' });
    window.location.hash = '#/';
  };
  if (app.role !== 'owner') return <p className="muted">Only the app owner can change these settings.</p>;
  return (
    <div className="card danger-zone stack">
      <h2>Delete this app</h2>
      <p>This revokes every key and deletes its sessions, results and leaderboards. It cannot be undone.</p>
      <label>
        Type <strong>{app.name}</strong> to confirm
        <input value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </label>
      <button className="danger" disabled={confirm !== app.name} onClick={remove}>Delete app</button>
    </div>
  );
}
