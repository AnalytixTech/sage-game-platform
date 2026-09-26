/**
 * Theme Studio: tune a theme and see the real games (from @sagegames/react) update live, then copy
 * the code. The preview plays locally; the full-flow preview talks to a mock server that replays
 * moves with the real engine, so it needs no API key.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  allGames,
  createTheme,
  GameLauncher,
  GamePreview,
  mergeTheme,
  presets,
  SageGameProvider,
  SageTheme,
} from '@sagegames/react';
import { replay } from '@sagegames/engine';
import type { CompletionResult, PlayInfo } from '@sagegames/types';
import { CopyButton, Icon, useToast } from '../ui';
import { createThemeOptions, DEFAULT_STATE, exportJson, exportSnippet, PresetName, RADII, sanitize, StudioState, themeOverrides } from '../themeExport';

const GAME_NAMES: Record<string, string> = {
  game_quiz_001: 'Quiz Master',
  game_memory_001: 'Memory Match',
  game_sudoku_001: 'Sudoku Arena',
  game_word_search_001: 'Word Search',
  game_word_001: 'Word Rush',
};

const EDITABLE_COLORS = ['primary', 'primaryAlt', 'background', 'surface', 'surfaceAlt', 'text', 'textMuted', 'border', 'success', 'danger'] as const;

const FONTS = [
  ['', 'System font'],
  ['Georgia, serif', 'Serif'],
  ['"Trebuchet MS", sans-serif', 'Humanist'],
  ['ui-rounded, "SF Pro Rounded", system-ui, sans-serif', 'Rounded'],
  ['ui-monospace, Menlo, monospace', 'Monospace'],
] as const;

const storageKey = (appId: string) => `sg-studio-${appId}`;

function load(appId: string): StudioState {
  try {
    const raw = localStorage.getItem(storageKey(appId));
    return raw ? sanitize(JSON.parse(raw)) : DEFAULT_STATE;
  } catch {
    return DEFAULT_STATE;
  }
}

/** The theme the studio settings describe (same maths the SDK does). */
function buildTheme(s: StudioState): SageTheme {
  const base = s.base === 'brand' ? createTheme(createThemeOptions(s) as unknown as Parameters<typeof createTheme>[0]) : presets[s.preset];
  return mergeTheme(base, themeOverrides(s));
}

/** A stand-in for the platform API: /play, /start, /complete (replayed with the real engine), /leaderboard. */
function mockFetch(gameId: string): typeof fetch {
  const plugin = allGames.find((g) => g.rules.gameId === gameId)!;
  const config = plugin.rules.parseConfig({});
  let lastScore = 0;
  const reply = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  return async (input, init) => {
    const url = String(input);
    if (url.endsWith('/play') || url.endsWith('/start')) {
      const play: PlayInfo = {
        sessionId: 'sess_preview',
        gameId,
        rulesVersion: plugin.rules.rulesVersion,
        seed: 'studio',
        config: config as Record<string, unknown>,
        status: 'active',
        displayName: 'You',
        contextId: null,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        startedAt: null,
        serverNow: new Date().toISOString(),
      };
      return reply(play);
    }
    if (url.endsWith('/complete')) {
      await new Promise((r) => setTimeout(r, 700));
      const { log } = JSON.parse(String(init?.body));
      const outcome = replay(plugin.rules, { seed: 'studio', config, log });
      lastScore = outcome.score;
      const result: CompletionResult = {
        sessionId: 'sess_preview',
        gameId,
        status: 'verified',
        valid: true,
        score: outcome.score,
        durationMs: outcome.activeMs,
        result: outcome.result as Record<string, unknown>,
        flags: [],
        rejectCode: null,
        rank: 2,
        completedAt: new Date().toISOString(),
      };
      return reply(result);
    }
    if (url.includes('/leaderboard')) {
      const entry = (rank: number, name: string, score: number) => ({ rank, externalUserId: name, username: name, score, achievedAt: '', gameId });
      return reply({ gameId, period: 'all_time', totalPlayers: 4, entries: [entry(1, 'Amara', Math.max(1450, lastScore + 1)), entry(2, 'You', lastScore), entry(3, 'Bayo', 610), entry(4, 'Chidi', 480)] });
    }
    return new Response('{}', { status: 404 });
  };
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="segmented">
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

export default function DesignStudio({ appId, gameIds }: { appId: string; gameIds: string[] }) {
  const [state, setState] = useState<StudioState>(() => load(appId));
  const [gameId, setGameId] = useState(gameIds[0] ?? 'game_memory_001');
  const [view, setView] = useState<'game' | 'flow'>('flow');
  const [device, setDevice] = useState<'phone' | 'tablet'>('phone');
  const [target, setTarget] = useState<'@sagegames/react-native' | '@sagegames/react'>('@sagegames/react-native');
  const [flowKey, setFlowKey] = useState(0);
  const toast = useToast();

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(appId), JSON.stringify(state));
    } catch {
      /* private mode: drafts just aren't kept */
    }
  }, [appId, state]);

  const set = (patch: Partial<StudioState>) => setState((s) => sanitize({ ...s, ...patch }));
  const theme = useMemo(() => buildTheme(state), [state]);
  const fetchImpl = useMemo(() => mockFetch(gameId), [gameId]);
  const plugin = allGames.find((g) => g.rules.gameId === gameId) ?? allGames[0];
  const snippet = exportSnippet(state, target);

  const download = () => {
    const blob = new Blob([exportJson(state)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sagegames-theme.json';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Theme downloaded');
  };

  return (
    <div className="studio">
      <style>{STUDIO_CSS}</style>
      <aside className="studio-controls card stack">
        <div>
          <p className="label">Start from</p>
          <Segmented label="Start from" value={state.base} options={[['preset', 'A preset'], ['brand', 'Your brand colour']] as const} onChange={(base) => set({ base })} />
        </div>

        {state.base === 'preset' ? (
          <div className="preset-grid">
            {(Object.keys(presets) as PresetName[]).map((p) => {
              const t = presets[p];
              return (
                <button key={p} type="button" className={`preset ${state.preset === p ? 'on' : ''}`} onClick={() => set({ preset: p })} aria-pressed={state.preset === p}>
                  <span className="swatch" style={{ background: t.colors.background }}>
                    <span style={{ background: `linear-gradient(135deg, ${t.gradients.primary[0]}, ${t.gradients.primary[1]})` }} />
                  </span>
                  {p === 'darkNavy' ? 'Dark navy' : p[0].toUpperCase() + p.slice(1)}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="stack">
            <div className="row">
              <label className="grow">
                Brand colour
                <div className="row">
                  <input type="color" value={state.brand} onChange={(e) => set({ brand: e.target.value })} style={{ width: 52 }} />
                  <input value={state.brand} onChange={(e) => set({ brand: e.target.value })} aria-label="Brand colour hex" />
                </div>
              </label>
              <label>
                Accent
                <input type="color" value={state.accent || theme.colors.primaryAlt} onChange={(e) => set({ accent: e.target.value })} style={{ width: 52 }} />
              </label>
            </div>
            <Segmented label="Mode" value={state.mode} options={[['dark', 'Dark'], ['light', 'Light']] as const} onChange={(mode) => set({ mode })} />
          </div>
        )}

        <div>
          <p className="label">Corners</p>
          <Segmented label="Corners" value={state.radius || 'default'} options={[['default', 'Default'], ['sharp', 'Sharp'], ['rounded', 'Rounded'], ['round', 'Round']] as const} onChange={(r) => set({ radius: r === 'default' ? '' : (r as keyof typeof RADII) })} />
        </div>

        <label>
          Font
          <select value={FONTS.some(([f]) => f === state.font) ? state.font : 'custom'} onChange={(e) => set({ font: e.target.value === 'custom' ? state.font || 'Inter' : e.target.value })}>
            {FONTS.map(([f, name]) => (
              <option key={name} value={f}>{name}</option>
            ))}
            <option value="custom">Your app's font…</option>
          </select>
          {!FONTS.some(([f]) => f === state.font) && (
            <input value={state.font} onChange={(e) => set({ font: e.target.value })} placeholder="Montserrat-Regular" aria-label="Font family name" />
          )}
          <span className="hint">In React Native, use the font's registered name (e.g. from expo-font).</span>
        </label>

        <div>
          <p className="label">Motion</p>
          <Segmented label="Motion" value={state.motion} options={[['full', 'Full'], ['reduced', 'Subtle'], ['none', 'Off']] as const} onChange={(motion) => set({ motion, celebrations: motion === 'full' })} />
        </div>
        <label className="row" style={{ flexDirection: 'row', fontWeight: 500 }}>
          <input type="checkbox" checked={state.celebrations} onChange={(e) => set({ celebrations: e.target.checked })} style={{ width: 'auto' }} /> Confetti and celebrations
        </label>
        <div>
          <p className="label">Density</p>
          <Segmented label="Density" value={state.density} options={[['comfortable', 'Comfortable'], ['compact', 'Compact']] as const} onChange={(density) => set({ density })} />
        </div>

        <details>
          <summary>Colours</summary>
          <div className="color-grid">
            {EDITABLE_COLORS.map((key) => (
              <label key={key} className="color-field">
                <input
                  type="color"
                  value={state.colors[key] ?? (theme.colors[key] as string).slice(0, 7)}
                  onChange={(e) => set({ colors: { ...state.colors, [key]: e.target.value } })}
                />
                <span>{key}</span>
                {state.colors[key] && (
                  <button type="button" className="link small" onClick={() => set({ colors: Object.fromEntries(Object.entries(state.colors).filter(([k]) => k !== key)) })}>
                    reset
                  </button>
                )}
              </label>
            ))}
          </div>
        </details>

        <button type="button" className="ghost small" onClick={() => setState(DEFAULT_STATE)}>Reset everything</button>
      </aside>

      <section className="studio-preview stack">
        <div className="row wrap between" style={{ alignItems: 'center' }}>
          <div className="row wrap">
            <select value={gameId} onChange={(e) => setGameId(e.target.value)} aria-label="Game" style={{ width: 'auto' }}>
              {allGames.map((g) => (
                <option key={g.rules.gameId} value={g.rules.gameId}>{GAME_NAMES[g.rules.gameId] ?? g.title}</option>
              ))}
            </select>
            <Segmented label="Preview" value={view} options={[['flow', 'Full flow'], ['game', 'Game only']] as const} onChange={setView} />
          </div>
          <div className="row">
            <Segmented label="Device" value={device} options={[['phone', 'Phone'], ['tablet', 'Tablet']] as const} onChange={setDevice} />
            {view === 'flow' && (
              <button type="button" className="ghost small" onClick={() => setFlowKey((k) => k + 1)} title="Restart">
                <Icon name="arrow" size={14} /> Restart
              </button>
            )}
          </div>
        </div>

        <div className={`device ${device}`} style={{ background: theme.colors.background }}>
          <SageGameProvider key={view === 'flow' ? `${gameId}-${flowKey}` : 'game'} games={allGames} theme={theme} baseUrl="https://preview.sagegames.local" fetch={fetchImpl}>
            {view === 'flow' ? (
              <GameLauncher
                key={`${gameId}-${flowKey}`}
                session={{ sessionId: 'sess_preview', sessionToken: 'stk_preview' }}
                onClose={() => setFlowKey((k) => k + 1)}
                style={{ minHeight: '100%' }}
              />
            ) : (
              <GamePreview key={gameId} plugin={plugin} seed="studio" />
            )}
          </SageGameProvider>
        </div>

        <div className="card stack">
          <div className="row between wrap">
            <h2>Use this theme</h2>
            <Segmented label="Package" value={target} options={[['@sagegames/react-native', 'React Native'], ['@sagegames/react', 'Web']] as const} onChange={setTarget} />
          </div>
          <div className="code-block">
            <div className="row between">
              <span className="label" style={{ margin: 0 }}>{target}</span>
              <div className="row">
                <button type="button" className="ghost small" onClick={download}>Download JSON</button>
                <CopyButton text={snippet} />
              </div>
            </div>
            <pre>{snippet}</pre>
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            Drafts are kept in this browser only. Contrast is checked for you: <code>createTheme</code> keeps every text colour at WCAG AA.
          </p>
        </div>
      </section>
    </div>
  );
}

const STUDIO_CSS = `
.studio { display: grid; grid-template-columns: 320px 1fr; gap: 20px; align-items: start; }
.studio-controls { position: sticky; top: 20px; max-height: calc(100vh - 40px); overflow-y: auto; }
.segmented { display: inline-flex; flex-wrap: wrap; gap: 2px; padding: 3px; border-radius: 10px; background: var(--surface-2); border: 1px solid var(--border); }
.segmented button { padding: 6px 10px; font-size: 13px; border-radius: 8px; background: transparent; color: var(--muted); }
.segmented button.on { background: var(--surface); color: var(--text); box-shadow: var(--shadow-sm); }
.preset-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.preset { flex-direction: column; align-items: stretch; gap: 6px; padding: 8px; background: var(--surface-2); border: 1px solid var(--border); font-size: 13px; }
.preset.on { border-color: var(--primary); background: var(--primary-soft); }
.swatch { display: flex; align-items: flex-end; height: 44px; border-radius: 8px; padding: 6px; border: 1px solid var(--border); }
.swatch span { display: block; height: 14px; width: 60%; border-radius: 5px; }
.color-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
.color-field { flex-direction: row; align-items: center; gap: 8px; font-weight: 500; font-size: 13px; }
.color-field input { width: 34px; height: 30px; padding: 1px; flex: none; }
.device { margin: 0 auto; width: 100%; border-radius: 28px; border: 10px solid #05060d; box-shadow: var(--shadow); overflow: auto; height: 720px; transition: max-width 200ms ease; }
.device.phone { max-width: 400px; }
.device.tablet { max-width: 760px; }
@media (max-width: 1100px) { .studio { grid-template-columns: 1fr; } .studio-controls { position: static; max-height: none; } }
@media (max-width: 480px) { .device { border-width: 6px; border-radius: 20px; height: 640px; } }
`;
