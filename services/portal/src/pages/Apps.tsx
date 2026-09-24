import { FormEvent, useEffect, useState } from 'react';
import { api, AppSummary, Game, json, listGames } from '../api';

export function GamePicker({ games, selected, onChange }: { games: Game[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((g) => g !== id) : [...selected, id]);
  return (
    <div className="games">
      {games.map((g) => (
        <label key={g.id} className={`game ${selected.includes(g.id) ? 'on' : ''}`}>
          <input type="checkbox" checked={selected.includes(g.id)} onChange={() => toggle(g.id)} />
          <span>
            <strong>{g.name}</strong>
            <span className="muted small">{g.description}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

export function AppsPage() {
  const [apps, setApps] = useState<AppSummary[] | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api<{ apps: AppSummary[] }>('/me')
      .then((me) => setApps(me.apps))
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    load();
    listGames().then((g) => {
      setGames(g);
      setSelected(g.map((x) => x.id));
    });
  }, []);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const app = await api<AppSummary>('/apps', { method: 'POST', body: json({ name, gameIds: selected }) });
      window.location.hash = `#/apps/${app.id}/keys`;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the app');
    }
  };

  if (!apps) return <p className="muted">{error ?? 'Loading your apps…'}</p>;

  return (
    <div className="stack-lg">
      <div className="row between">
        <div>
          <h1>Your apps</h1>
          <p className="muted">Each app gets its own API keys, games, webhook and leaderboards.</p>
        </div>
        {!creating && <button className="primary" onClick={() => setCreating(true)}>New app</button>}
      </div>

      {error && <p className="error">{error}</p>}

      {creating && (
        <form className="card stack" onSubmit={create}>
          <h2>Create an app</h2>
          <label>
            App name
            <input required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Japabudz" />
          </label>
          <div>
            <p className="label">Games this app can use</p>
            <GamePicker games={games} selected={selected} onChange={setSelected} />
          </div>
          <div className="row">
            <button className="primary" disabled={!name.trim()}>Create app</button>
            <button type="button" className="ghost" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </form>
      )}

      {apps.length === 0 && !creating ? (
        <div className="card empty">
          <h2>Create your first app</h2>
          <p className="muted">You will get an API key for your backend to start game sessions for your users.</p>
          <button className="primary" onClick={() => setCreating(true)}>New app</button>
        </div>
      ) : (
        <div className="grid">
          {apps.map((a) => (
            <a key={a.id} className="card app-card" href={`#/apps/${a.id}/keys`}>
              <h2>{a.name}</h2>
              <p className="muted small">{a.id}</p>
              <p className="small">{a.gameIds.length} games · {a.role}</p>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
