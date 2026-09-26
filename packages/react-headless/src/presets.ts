import { contrast, ensureContrast, fromHsl, mix, parseHex, readableOn, toHsl } from './color';
import {
  DEFAULT_FOUND_PALETTE,
  DEFAULT_MOTION,
  DEFAULT_SPACING,
  DEFAULT_TYPOGRAPHY,
  mergeTheme,
  PartialTheme,
  resolveTheme,
  SageTheme,
} from './theme';

export interface CreateThemeOptions {
  /** Your brand colour (hex). Buttons, highlights and gradients are built from it. */
  brand: string;
  mode?: 'dark' | 'light';
  /** Second gradient colour; derived from the brand when omitted. */
  accent?: string;
  radius?: 'sharp' | 'rounded' | 'round';
  /** One font family for everything, or one per weight. */
  font?: string | Partial<SageTheme['fonts']>;
  /** full (default), reduced (subtle, no confetti) or none. */
  motion?: 'full' | 'reduced' | 'none';
  celebrations?: boolean;
  density?: SageTheme['density'];
  name?: string;
}

const RADII: Record<NonNullable<CreateThemeOptions['radius']>, SageTheme['radii']> = {
  sharp: { sm: 4, md: 6, lg: 8, xl: 12, pill: 999 },
  rounded: { sm: 8, md: 12, lg: 18, xl: 26, pill: 999 },
  round: { sm: 12, md: 18, lg: 26, xl: 34, pill: 999 },
};

/** AA for body text. */
const TEXT = 4.5;

/** Adjust `fg` until it reaches `ratio` against every background (they must all be dark or all light). */
function ensureOnAll(fg: string, backgrounds: string[], ratio = TEXT): string {
  let out = fg;
  for (let round = 0; round < 6; round++) {
    const failing = backgrounds.find((bg) => contrast(out, bg) < ratio);
    if (!failing) return out;
    out = ensureContrast(out, failing, ratio);
  }
  return out;
}

/** Move `bg` towards `towards` until `text` reads on it (for tinted cells behind text). */
function softenUntilReadable(bg: string, text: string, towards: string, ratio = TEXT): string {
  let out = bg;
  for (let i = 1; contrast(text, out) < ratio && i <= 20; i++) out = mix(bg, towards, i * 0.05);
  return out;
}

/** Nudge a button colour until white or near-black text on it reaches AA; returns [colour, text]. */
function buttonColors(color: string): [string, string] {
  if (Math.max(contrast('#ffffff', color), contrast('#111111', color)) >= TEXT) return [color, readableOn(color)];
  const hsl = toHsl(color);
  for (let i = 1; i <= 30; i++) {
    const darker = fromHsl({ ...hsl, l: Math.max(0, hsl.l - i * 0.02) });
    if (contrast('#ffffff', darker) >= TEXT) return [darker, '#ffffff'];
    const lighter = fromHsl({ ...hsl, l: Math.min(1, hsl.l + i * 0.02) });
    if (contrast('#111111', lighter) >= TEXT) return [lighter, '#111111'];
  }
  return [color, readableOn(color)];
}

/** A complete, accessible theme from one brand colour. */
export function createTheme(options: CreateThemeOptions): SageTheme {
  parseHex(options.brand); // throws on anything that isn't a hex colour
  const mode = options.mode ?? 'dark';
  const { h, s } = toHsl(options.brand);
  const tint = (sat: number, l: number) => fromHsl({ h, s: Math.min(s, 0.6) * sat, l });

  const neutrals =
    mode === 'dark'
      ? { background: tint(0.55, 0.07), surface: tint(0.5, 0.115), surfaceAlt: tint(0.5, 0.155), surfaceRaised: tint(0.5, 0.19), border: tint(0.45, 0.26) }
      : { background: tint(0.35, 0.97), surface: '#ffffff', surfaceAlt: tint(0.35, 0.945), surfaceRaised: '#ffffff', border: tint(0.3, 0.86) };
  const surfaces = [neutrals.background, neutrals.surface, neutrals.surfaceAlt, neutrals.surfaceRaised];

  const text = ensureOnAll(mode === 'dark' ? tint(0.25, 0.97) : tint(0.4, 0.1), surfaces, 7);
  const textMuted = ensureOnAll(mode === 'dark' ? tint(0.3, 0.74) : tint(0.3, 0.38), surfaces);

  // Primary must stand out from the background (3:1, WCAG for UI parts) and carry readable text.
  const [primary, onPrimary] = buttonColors(ensureContrast(options.brand, neutrals.background, 3));
  const altSeed = options.accent ?? fromHsl({ h: h + 32, s: Math.min(1, s * 1.05 + 0.05), l: toHsl(primary).l + 0.04 });
  const primaryAlt = ensureContrast(altSeed, onPrimary, TEXT);

  const status =
    mode === 'dark' ? { success: '#34d399', danger: '#f87171', warning: '#fbbf24' } : { success: '#0f8a5f', danger: '#c2334d', warning: '#a16207' };

  const cellBase = neutrals.surface;
  const colors: SageTheme['colors'] = {
    ...neutrals,
    text,
    textMuted,
    primary,
    primaryAlt,
    onPrimary,
    success: ensureOnAll(status.success, surfaces),
    danger: ensureOnAll(status.danger, surfaces),
    warning: ensureOnAll(status.warning, surfaces),
    highlight: softenUntilReadable(mix(primary, cellBase, 0.5), text, cellBase),
    cellSelected: softenUntilReadable(mix(primary, cellBase, 0.55), text, cellBase),
    cellPeer: softenUntilReadable(mix(primary, cellBase, mode === 'dark' ? 0.82 : 0.9), text, cellBase),
    cellConflict: softenUntilReadable(mix('#ef4444', cellBase, mode === 'dark' ? 0.6 : 0.82), text, cellBase),
    overlay: '',
    focus: primaryAlt,
    gameAccents: { quiz: '', memory: '', sudoku: '', wordSearch: '', wordRush: '' },
    foundPalette: DEFAULT_FOUND_PALETTE.slice(),
  };

  const font = options.font;
  const fonts: SageTheme['fonts'] =
    typeof font === 'string' ? { regular: font, medium: font, bold: font } : { regular: '', medium: '', bold: '', ...font };

  const motionLevel = options.motion ?? 'full';
  const motion: SageTheme['motion'] = {
    ...DEFAULT_MOTION,
    scale: motionLevel === 'none' ? 0 : motionLevel === 'reduced' ? 0.7 : 1,
    celebrations: options.celebrations ?? motionLevel === 'full',
  };

  const input: PartialTheme = {
    name: options.name ?? 'custom',
    mode,
    // overlay and gameAccents are left to the derived rules (they depend on mode and background).
    colors: { ...colors, overlay: undefined, gameAccents: undefined },
    radii: RADII[options.radius ?? 'rounded'],
    spacing: DEFAULT_SPACING,
    fonts,
    typography: DEFAULT_TYPOGRAPHY,
    motion,
    density: options.density ?? 'comfortable',
  };
  return resolveTheme(input, SKELETON);
}

/** Non-colour defaults every preset starts from (its colours are always replaced). */
const SKELETON: SageTheme = {
  name: 'base',
  mode: 'dark',
  colors: {
    background: '#0b0f1e', surface: '#141a30', surfaceAlt: '#1b2240', surfaceRaised: '#222a4c', border: '#2a3358',
    text: '#f5f7ff', textMuted: '#a3acc9', primary: '#7c5cff', primaryAlt: '#c04bff', onPrimary: '#ffffff',
    success: '#34d399', danger: '#f87171', warning: '#fbbf24', highlight: '#3b2f7a', cellSelected: '#3b2f7a',
    cellPeer: '#1d2145', cellConflict: '#5b1f2c', overlay: 'rgba(11, 15, 30, 0.72)', focus: '#c04bff',
    gameAccents: { quiz: '#8b5cf6', memory: '#ec4899', sudoku: '#3b82f6', wordSearch: '#10b981', wordRush: '#f97316' },
    foundPalette: DEFAULT_FOUND_PALETTE.slice(),
  },
  radii: RADII.rounded,
  spacing: DEFAULT_SPACING,
  fonts: { regular: '', medium: '', bold: '' },
  elevation: {
    sm: { color: '#000000', opacity: 0.35, radius: 6, offsetY: 2, elevation: 2 },
    md: { color: '#000000', opacity: 0.45, radius: 16, offsetY: 6, elevation: 6 },
    lg: { color: '#000000', opacity: 0.55, radius: 32, offsetY: 14, elevation: 12 },
  },
  gradients: { primary: ['#7c5cff', '#c04bff'], surface: ['#171d36', '#141a30'], hero: ['#7c5cff', '#4a2f86'] },
  typography: DEFAULT_TYPOGRAPHY,
  motion: DEFAULT_MOTION,
  density: 'comfortable',
};

/** The default: a polished, game-like dark theme with violet-to-magenta gradients. */
export const arcadeTheme: SageTheme = createTheme({ name: 'arcade', brand: '#7c5cff', accent: '#d946ef', mode: 'dark', radius: 'round' });

/** Dark navy with gold, as used by Japabudz (the 2.0 colours, now with depth and motion). */
export const darkNavyTheme: SageTheme = resolveTheme(
  {
    name: 'darkNavy',
    colors: {
      background: '#000b21', surface: '#0f1b38', surfaceAlt: '#16254a', border: '#243560', text: '#ffffff', textMuted: '#9aa6c4',
      primary: '#ba8109', primaryAlt: '#e0a526', onPrimary: '#ffffff', success: '#34d399', danger: '#f87171', warning: '#fbbf24',
      highlight: '#7a5a12', cellSelected: '#3b4f86', cellPeer: '#1b2b55', cellConflict: '#5b1f2c',
    },
    radii: RADII.rounded,
  },
  SKELETON
);

/** Bright and clean (the 2.0 light colours, now with depth and motion). */
export const lightTheme: SageTheme = resolveTheme(
  {
    name: 'light',
    colors: {
      background: '#f6f7fb', surface: '#ffffff', surfaceAlt: '#eef1f7', surfaceRaised: '#ffffff', border: '#d9deea', text: '#141a2e',
      textMuted: '#5d6680', primary: '#4f46e5', primaryAlt: '#7c3aed', onPrimary: '#ffffff', success: '#0f8a5f', danger: '#c2334d',
      warning: '#b7791f', highlight: '#fde68a', cellSelected: '#c7d2fe', cellPeer: '#eef0ff', cellConflict: '#fde2e7',
    },
    radii: RADII.rounded,
  },
  SKELETON
);

/** Flat and calm: no gradients, soft shadows, subtle motion, no confetti. Blends into most apps. */
export const minimalTheme: SageTheme = (() => {
  const base = createTheme({ name: 'minimal', brand: '#2563eb', mode: 'light', radius: 'rounded', motion: 'reduced', celebrations: false });
  const c = base.colors;
  return mergeTheme(base, {
    gradients: { primary: [c.primary, c.primary], hero: [c.primary, c.primary], surface: [c.surface, c.surface] },
    elevation: { md: base.elevation.sm, lg: base.elevation.sm },
  });
})();

export const presets = { arcade: arcadeTheme, darkNavy: darkNavyTheme, light: lightTheme, minimal: minimalTheme };
export type PresetName = keyof typeof presets;
