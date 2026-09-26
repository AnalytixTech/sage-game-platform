import { FormEvent, useEffect, useState } from 'react';
import { api, AppSummary, Game, json, listGames } from '../api';
import { Link, navigate } from '../router';
import { EmptyState, Icon, Modal, Skeleton, useToast } from '../ui';

const GLYPHS: Record<string, string> = {
  game_quiz_001: '🧠',
  game_memory_001: '🃏',
  game_sudoku_001: '🔢',
  game_word_search_001: '🔎',
  game_word_001: '⚡',
};

export function GamePicker({ games, selected, onChange }: { games: Game[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((g) => g !== id) : [...selected, id]);
  return (
    <div className="games">
      {games.map((g) => (
        <label key={g.id} className={`game ${selected.includes(g.id) ? 'on' : ''}`}>
          <input type="checkbox" checked={selected.includes(g.id)} onChange={() => toggle(g.id)} />
          <span className="glyph" aria-hidden>{GLYPHS[g.id] ?? '🎮'}</span>
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
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    api<{ apps: AppSummary[] }>('/me')
      .then((me) => setApps(me.apps))
      .catch((e: Error) => setError(e.message));
    listGames().then((g) => {
      setGames(g);
      setSelected(g.map((x) => x.id));
    });
  }, []);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const app = await api<AppSummary>('/apps', { method: 'POST', body: json({ name, gameIds: selected }) });
      toast(`${app.name} created`);
      navigate(`/apps/${app.id}/overview`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the app');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Your apps</h1>
          <p className="muted">Each app has its own API keys, games, webhook, quiz banks, theme and leaderboards.</p>
        </div>
        <button className="primary" onClick={() => setCreating(true)}>
          <Icon name="plus" size={16} /> New app
        </button>
      </div>

      {error && !creating && <p className="error">{error}</p>}

      {!apps ? (
        <div className="grid">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card">
              <Skeleton lines={3} />
            </div>
          ))}
        </div>
      ) : apps.length === 0 ? (
        <EmptyState icon="games" title="Create your first app">
          <p className="muted" style={{ maxWidth: 420, margin: 0 }}>
            You'll get an API key for your backend, pick the games your players can play, and can style them to match your app.
          </p>
          <button className="primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={16} /> New app
          </button>
        </EmptyState>
      ) : (
        <div className="grid">
          {apps.map((a) => (
            <Link key={a.id} className="card app-card" to={`/apps/${a.id}/overview`}>
              <span className="app-icon">{a.name.slice(0, 1).toUpperCase()}</span>
              <h2>{a.name}</h2>
              <p className="muted small" style={{ margin: 0 }}>
                <code>{a.id}</code>
              </p>
              <p className="small" style={{ margin: 0 }}>
                {a.gameIds.map((g) => GLYPHS[g] ?? '🎮').join(' ')} · {a.gameIds.length} games · {a.role}
              </p>
            </Link>
          ))}
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Create an app">
        <form className="stack" onSubmit={create}>
          {error && <p className="error">{error}</p>}
          <label>
            App name
            <input required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Japabudz" />
          </label>
          <div>
            <p className="label">Games this app can use</p>
            <GamePicker games={games} selected={selected} onChange={setSelected} />
          </div>
          <div className="row">
            <button className="primary" disabled={!name.trim() || busy}>{busy ? 'Creating…' : 'Create app'}</button>
            <button type="button" className="ghost" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
