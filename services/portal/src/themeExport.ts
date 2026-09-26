/**
 * Theme Studio state → the code a developer pastes into their app. Pure (no React), so it's
 * unit-tested. The output never contains credentials: only theme values.
 */

export type PresetName = 'arcade' | 'darkNavy' | 'light' | 'minimal';
export type Radius = 'sharp' | 'rounded' | 'round';
export type Motion = 'full' | 'reduced' | 'none';

export interface StudioState {
  base: 'preset' | 'brand';
  preset: PresetName;
  brand: string;
  mode: 'dark' | 'light';
  accent: string;
  radius: Radius | '';
  font: string;
  motion: Motion;
  celebrations: boolean;
  density: 'comfortable' | 'compact';
  /** Colour tokens set by hand in the advanced panel. */
  colors: Record<string, string>;
}

export const DEFAULT_STATE: StudioState = {
  base: 'preset',
  preset: 'arcade',
  brand: '#7c5cff',
  mode: 'dark',
  accent: '',
  radius: '',
  font: '',
  motion: 'full',
  celebrations: true,
  density: 'comfortable',
  colors: {},
};

export const PRESET_EXPORTS: Record<PresetName, string> = {
  arcade: 'arcadeTheme',
  darkNavy: 'darkNavyTheme',
  light: 'lightTheme',
  minimal: 'minimalTheme',
};

export const RADII: Record<Radius, { sm: number; md: number; lg: number; xl: number }> = {
  sharp: { sm: 4, md: 6, lg: 8, xl: 12 },
  rounded: { sm: 8, md: 12, lg: 18, xl: 26 },
  round: { sm: 12, md: 18, lg: 26, xl: 34 },
};

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Keep only well-formed values (the state comes from localStorage and inputs). */
export function sanitize(input: Partial<StudioState>): StudioState {
  const s = { ...DEFAULT_STATE, ...input };
  const pick = <T extends string>(v: string, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
  return {
    base: pick(s.base, ['preset', 'brand'] as const, 'preset'),
    preset: pick(s.preset, ['arcade', 'darkNavy', 'light', 'minimal'] as const, 'arcade'),
    brand: HEX.test(s.brand) ? s.brand.toLowerCase() : DEFAULT_STATE.brand,
    mode: pick(s.mode, ['dark', 'light'] as const, 'dark'),
    accent: HEX.test(s.accent) ? s.accent.toLowerCase() : '',
    radius: pick(s.radius, ['', 'sharp', 'rounded', 'round'] as const, ''),
    font: String(s.font ?? '').replace(/['"`\\\n\r]/g, '').slice(0, 60),
    motion: pick(s.motion, ['full', 'reduced', 'none'] as const, 'full'),
    celebrations: !!s.celebrations,
    density: pick(s.density, ['comfortable', 'compact'] as const, 'comfortable'),
    colors: Object.fromEntries(Object.entries(s.colors ?? {}).filter(([k, v]) => /^[a-zA-Z]+$/.test(k) && HEX.test(v)).map(([k, v]) => [k, v.toLowerCase()])),
  };
}

/** The `createTheme` options for a brand-based theme. */
export function createThemeOptions(input: StudioState): Record<string, unknown> {
  const s = sanitize(input);
  return {
    brand: s.brand,
    mode: s.mode,
    ...(s.accent ? { accent: s.accent } : {}),
    ...(s.radius ? { radius: s.radius } : {}),
    ...(s.font ? { font: s.font } : {}),
    ...(s.motion !== 'full' ? { motion: s.motion } : {}),
  };
}

/** Overrides applied on top of the base theme (everything the base doesn't already cover). */
export function themeOverrides(input: StudioState): Record<string, unknown> {
  const s = sanitize(input);
  const o: Record<string, unknown> = {};
  if (Object.keys(s.colors).length) o.colors = { ...s.colors };
  if (s.base === 'preset') {
    if (s.radius) o.radii = RADII[s.radius];
    if (s.font) o.fonts = { regular: s.font, medium: s.font, bold: s.font };
  }
  const motion: Record<string, unknown> = {};
  if (s.base === 'preset' && s.motion !== 'full') motion.scale = s.motion === 'none' ? 0 : 0.7;
  const defaultCelebrations = s.base === 'brand' ? s.motion === 'full' : true;
  if (s.celebrations !== defaultCelebrations) motion.celebrations = s.celebrations;
  if (Object.keys(motion).length) o.motion = motion;
  if (s.density !== 'comfortable') o.density = s.density;
  return o;
}

const js = (value: unknown, indent = 0): string => {
  const pad = ' '.repeat(indent);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const entries = Object.entries(value);
    if (!entries.length) return '{}';
    const inner = entries.map(([k, v]) => `${pad}  ${/^[a-zA-Z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}: ${js(v, indent + 2)},`).join('\n');
    return `{\n${inner}\n${pad}}`;
  }
  return typeof value === 'string' ? `'${value}'` : JSON.stringify(value);
};

/** Paste-ready code for `@sagegames/react-native` or `@sagegames/react`. */
export function exportSnippet(input: StudioState, pkg: '@sagegames/react-native' | '@sagegames/react'): string {
  const s = sanitize(input);
  const overrides = themeOverrides(s);
  const hasOverrides = Object.keys(overrides).length > 0;
  const base = s.base === 'brand' ? 'createTheme' : PRESET_EXPORTS[s.preset];
  const lines = [
    `import { allGames, ${base}, SageGameProvider } from '${pkg}';`,
    '',
    '// Define these once, outside your components.',
    s.base === 'brand' ? `const theme = createTheme(${js(createThemeOptions(s))});` : `const theme = ${base};`,
  ];
  if (hasOverrides) lines.push(`const themeOverrides = ${js(overrides)};`);
  lines.push(
    '',
    `<SageGameProvider games={allGames} theme={theme}${hasOverrides ? ' themeOverrides={themeOverrides}' : ''} baseUrl={SAGEGAMES_API_URL}>`,
    '  {/* your app */}',
    '</SageGameProvider>'
  );
  return lines.join('\n');
}

/** The same settings as JSON (for sharing or saving in your repo). */
export function exportJson(input: StudioState): string {
  const s = sanitize(input);
  return JSON.stringify(
    s.base === 'brand' ? { createTheme: createThemeOptions(s), themeOverrides: themeOverrides(s) } : { preset: s.preset, themeOverrides: themeOverrides(s) },
    null,
    2
  );
}
