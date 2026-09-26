/**
 * Visual tokens every SageGames view reads. Hosts start from a preset (`arcadeTheme`,
 * `darkNavyTheme`, `lightTheme`, `minimalTheme`) or `createTheme({ brand })`, and override any
 * token. Tokens derived from colours (gradients, the focus ring, raised surfaces…) follow the
 * colours they come from unless they're overridden too.
 */
import { alpha, fromHsl, isDark, isHex, mix, toHsl } from './color';

export type FontWeight = 'regular' | 'medium' | 'bold';
export type GameAccentKey = 'quiz' | 'memory' | 'sudoku' | 'wordSearch' | 'wordRush';

/** A drop shadow. Web: box-shadow; React Native: boxShadow (RN 0.76+) with shadow and elevation fallbacks. */
export interface ShadowToken {
  color: string;
  opacity: number;
  radius: number;
  offsetY: number;
  /** Android elevation. */
  elevation: number;
}

export interface TypeToken {
  size: number;
  weight: FontWeight;
  letterSpacing: number;
  lineHeight: number;
}

export interface SageTheme {
  /** Preset name, for tools and debugging. */
  name: string;
  mode: 'dark' | 'light';
  colors: {
    background: string;
    surface: string;
    surfaceAlt: string;
    /** Cards that sit above other cards (dialogs, the pause sheet). */
    surfaceRaised: string;
    border: string;
    text: string;
    textMuted: string;
    primary: string;
    /** Second stop of the primary gradient. */
    primaryAlt: string;
    onPrimary: string;
    success: string;
    danger: string;
    warning: string;
    /** Found words, matched cards, highlighted paths. */
    highlight: string;
    cellSelected: string;
    cellPeer: string;
    cellConflict: string;
    /** Scrim behind overlays (pause, dialogs). */
    overlay: string;
    /** Keyboard focus ring. */
    focus: string;
    /** One colour per game: intro headers, catalog tiles, card backs. */
    gameAccents: Record<GameAccentKey, string>;
    /** Colours for found words (Word Search), used in order. Text on them is dark. */
    foundPalette: string[];
  };
  radii: { sm: number; md: number; lg: number; xl: number; pill: number };
  spacing: { xs: number; sm: number; md: number; lg: number; xl: number };
  /** Font family names (React Native) or CSS font-family values (web). Empty = platform default. */
  fonts: { regular: string; medium: string; bold: string };
  elevation: { sm: ShadowToken; md: ShadowToken; lg: ShadowToken };
  /** Two-stop gradients (drawn top-left → bottom-right). React Native < 0.76 uses the first stop. */
  gradients: { primary: [string, string]; surface: [string, string]; hero: [string, string] };
  typography: { display: TypeToken; title: TypeToken; heading: TypeToken; body: TypeToken; caption: TypeToken; numeric: TypeToken };
  motion: {
    /** 0 = no motion, 1 = default, above 1 = slower. The OS "reduce motion" setting also turns motion off. */
    scale: number;
    spring: { tension: number; friction: number };
    durations: { fast: number; base: number; slow: number };
    /** Confetti and victory effects. */
    celebrations: boolean;
  };
  /** Compact tightens padding and touch targets a little (never below 44px). */
  density: 'comfortable' | 'compact';
}

export type DeepPartial<T> = T extends readonly unknown[] ? T : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

/** A theme or any part of one; missing tokens are filled in. */
export type PartialTheme = DeepPartial<SageTheme>;

export const GAME_ACCENT_KEYS: Record<string, GameAccentKey> = {
  game_quiz_001: 'quiz',
  game_memory_001: 'memory',
  game_sudoku_001: 'sudoku',
  game_word_search_001: 'wordSearch',
  game_word_001: 'wordRush',
};

const GAME_GLYPHS: Record<string, string> = {
  game_quiz_001: '🧠',
  game_memory_001: '🃏',
  game_sudoku_001: '🔢',
  game_word_search_001: '🔎',
  game_word_001: '⚡',
};

/** An emoji that stands for a game (intro headers, catalog tiles). */
export const gameGlyph = (gameId: string): string => GAME_GLYPHS[gameId] ?? '🎮';

/** The accent colour for a game id (falls back to primary). */
export function gameAccent(theme: SageTheme, gameId: string): string {
  const key = GAME_ACCENT_KEYS[gameId];
  return key ? theme.colors.gameAccents[key] : theme.colors.primary;
}

// ---------------------------------------------------------------- defaults

export const DEFAULT_TYPOGRAPHY: SageTheme['typography'] = {
  display: { size: 44, weight: 'bold', letterSpacing: -0.5, lineHeight: 1.1 },
  title: { size: 24, weight: 'bold', letterSpacing: -0.2, lineHeight: 1.2 },
  heading: { size: 18, weight: 'bold', letterSpacing: 0, lineHeight: 1.3 },
  body: { size: 15, weight: 'regular', letterSpacing: 0, lineHeight: 1.45 },
  caption: { size: 12, weight: 'medium', letterSpacing: 0.4, lineHeight: 1.35 },
  numeric: { size: 22, weight: 'bold', letterSpacing: 0, lineHeight: 1.1 },
};

export const DEFAULT_MOTION: SageTheme['motion'] = {
  scale: 1,
  spring: { tension: 180, friction: 14 },
  durations: { fast: 140, base: 240, slow: 420 },
  celebrations: true,
};

export const DEFAULT_RADII: SageTheme['radii'] = { sm: 8, md: 12, lg: 18, xl: 26, pill: 999 };
export const DEFAULT_SPACING: SageTheme['spacing'] = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

const ACCENTS: Record<'dark' | 'light', Record<GameAccentKey, string>> = {
  dark: { quiz: '#8b5cf6', memory: '#ec4899', sudoku: '#3b82f6', wordSearch: '#10b981', wordRush: '#f97316' },
  light: { quiz: '#7c3aed', memory: '#db2777', sudoku: '#2563eb', wordSearch: '#059669', wordRush: '#ea580c' },
};

export const DEFAULT_FOUND_PALETTE = ['#fde68a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#ddd6fe', '#fed7aa', '#a7f3d0', '#c7d2fe'];

function shadow(mode: 'dark' | 'light', level: 'sm' | 'md' | 'lg'): ShadowToken {
  const color = mode === 'dark' ? '#000000' : '#1b2240';
  const table = {
    sm: { opacity: mode === 'dark' ? 0.35 : 0.08, radius: 6, offsetY: 2, elevation: 2 },
    md: { opacity: mode === 'dark' ? 0.45 : 0.12, radius: 16, offsetY: 6, elevation: 6 },
    lg: { opacity: mode === 'dark' ? 0.55 : 0.16, radius: 32, offsetY: 14, elevation: 12 },
  };
  return { color, ...table[level] };
}

// ---------------------------------------------------------------- derived tokens

/** Colour maths only works on hex; anything else (rgb(), names) falls back to the source colour. */
const safe = (fn: () => string, fallback: string) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

const hexOr = (value: string, fallback: string) => (isHex(value) ? value : fallback);

interface DerivedRule {
  /** Token path this rule fills, e.g. 'gradients.primary'. */
  target: string;
  /** Token paths it's computed from. */
  deps: string[];
  compute: (t: SageTheme) => unknown;
}

const DERIVED: DerivedRule[] = [
  { target: 'mode', deps: ['colors.background'], compute: (t) => (safe(() => (isDark(t.colors.background) ? 'dark' : 'light'), 'dark') as 'dark' | 'light') },
  {
    target: 'colors.primaryAlt',
    deps: ['colors.primary'],
    compute: (t) =>
      safe(() => {
        const hsl = toHsl(t.colors.primary);
        return fromHsl({ h: hsl.h + 32, s: Math.min(1, hsl.s * 1.05), l: Math.min(0.72, hsl.l + 0.06) });
      }, t.colors.primary),
  },
  { target: 'colors.surfaceRaised', deps: ['colors.surfaceAlt', 'colors.text'], compute: (t) => safe(() => mix(t.colors.surfaceAlt, t.colors.text, 0.04), t.colors.surfaceAlt) },
  { target: 'colors.overlay', deps: ['colors.background'], compute: (t) => safe(() => alpha(t.colors.background, 0.72), 'rgba(0, 0, 0, 0.6)') },
  { target: 'colors.focus', deps: ['colors.primary'], compute: (t) => t.colors.primary },
  { target: 'colors.gameAccents', deps: ['mode'], compute: (t) => ({ ...ACCENTS[t.mode] }) },
  { target: 'colors.foundPalette', deps: [], compute: () => DEFAULT_FOUND_PALETTE.slice() },
  { target: 'gradients.primary', deps: ['colors.primary', 'colors.primaryAlt'], compute: (t) => [t.colors.primary, t.colors.primaryAlt] },
  {
    target: 'gradients.surface',
    deps: ['colors.surface', 'colors.primary'],
    compute: (t) => [safe(() => mix(t.colors.surface, hexOr(t.colors.primary, t.colors.surface), 0.07), t.colors.surface), t.colors.surface],
  },
  {
    target: 'gradients.hero',
    deps: ['colors.primary', 'colors.primaryAlt', 'colors.background'],
    compute: (t) => [t.colors.primary, safe(() => mix(t.colors.primaryAlt, t.colors.background, 0.35), t.colors.primaryAlt)],
  },
  { target: 'elevation', deps: ['mode'], compute: (t) => ({ sm: shadow(t.mode, 'sm'), md: shadow(t.mode, 'md'), lg: shadow(t.mode, 'lg') }) },
];

// ---------------------------------------------------------------- merging

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function deepMerge<T>(base: T, override: unknown): T {
  if (!isPlainObject(override)) return (override === undefined ? base : (override as T));
  const out: Record<string, unknown> = isPlainObject(base) ? { ...(base as Record<string, unknown>) } : {};
  for (const [k, v] of Object.entries(override)) {
    if (v === undefined) continue;
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

const get = (obj: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((o, k) => (isPlainObject(o) ? o[k] : undefined), obj);

function set(obj: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) {
    o[k] = isPlainObject(o[k]) ? { ...(o[k] as Record<string, unknown>) } : {};
    o = o[k] as Record<string, unknown>;
  }
  o[keys[keys.length - 1]] = value;
}

/** Was `path` (or anything under it, or anything above it) given in `partial`? */
const touches = (partial: unknown, path: string) => get(partial, path) !== undefined;

/** Fill every missing token of a partial theme (e.g. a 2.1-style theme with only colours). */
export function resolveTheme(input: PartialTheme, fallback: SageTheme): SageTheme {
  // Everything not derived comes from the fallback; derived tokens are recomputed from this theme's colours.
  const out = deepMerge(fallback, input) as unknown as Record<string, unknown>;
  for (const rule of DERIVED) {
    if (!touches(input, rule.target)) set(out, rule.target, rule.compute(out as unknown as SageTheme));
  }
  return out as unknown as SageTheme;
}

/**
 * Apply overrides to a theme. Derived tokens (gradients, primaryAlt, focus…) follow any colour
 * they depend on that the override changes, unless the override sets them too.
 */
export function mergeTheme(base: SageTheme, override?: PartialTheme): SageTheme {
  if (!override) return base;
  const out = deepMerge(base, override) as unknown as Record<string, unknown>;
  const changed = new Set<string>();
  for (const rule of DERIVED) {
    const depChanged = rule.deps.some((d) => touches(override, d) || changed.has(d));
    if (depChanged && !touches(override, rule.target)) {
      set(out, rule.target, rule.compute(out as unknown as SageTheme));
      changed.add(rule.target);
    }
  }
  return out as unknown as SageTheme;
}

// ---------------------------------------------------------------- helpers for views

/** Milliseconds for a motion duration, scaled; 0 when motion is off. */
export function motionMs(theme: SageTheme, key: keyof SageTheme['motion']['durations'], reduced: boolean): number {
  if (reduced || theme.motion.scale <= 0) return 0;
  return Math.round(theme.motion.durations[key] * theme.motion.scale);
}

/** Minimum touch target for the theme's density. */
export const touchTarget = (theme: SageTheme): number => (theme.density === 'compact' ? 44 : 48);
