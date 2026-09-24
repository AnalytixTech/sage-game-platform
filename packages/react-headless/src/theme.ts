/** Visual tokens every SageGames view reads. Hosts pass a partial theme to match their app. */
export interface SageTheme {
  colors: {
    background: string;
    surface: string;
    surfaceAlt: string;
    border: string;
    text: string;
    textMuted: string;
    primary: string;
    onPrimary: string;
    success: string;
    danger: string;
    warning: string;
    /** Found words, matched cards, highlighted paths. */
    highlight: string;
    cellSelected: string;
    cellPeer: string;
    cellConflict: string;
  };
  radii: { sm: number; md: number; lg: number };
  spacing: { xs: number; sm: number; md: number; lg: number; xl: number };
  /** Font family names (React Native) or CSS font-family values (web). Empty = platform default. */
  fonts: { regular: string; medium: string; bold: string };
}

export type PartialTheme = {
  colors?: Partial<SageTheme['colors']>;
  radii?: Partial<SageTheme['radii']>;
  spacing?: Partial<SageTheme['spacing']>;
  fonts?: Partial<SageTheme['fonts']>;
};

const shared = {
  radii: { sm: 6, md: 10, lg: 16 },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
  fonts: { regular: '', medium: '', bold: '' },
};

export const lightTheme: SageTheme = {
  ...shared,
  colors: {
    background: '#f6f7fb',
    surface: '#ffffff',
    surfaceAlt: '#eef1f7',
    border: '#d9deea',
    text: '#141a2e',
    textMuted: '#5d6680',
    primary: '#4f46e5',
    onPrimary: '#ffffff',
    success: '#0f8a5f',
    danger: '#c2334d',
    warning: '#b7791f',
    highlight: '#fde68a',
    cellSelected: '#c7d2fe',
    cellPeer: '#eef0ff',
    cellConflict: '#fde2e7',
  },
};

/** Dark navy preset that fits apps like Japabudz. */
export const darkNavyTheme: SageTheme = {
  ...shared,
  colors: {
    background: '#000b21',
    surface: '#0f1b38',
    surfaceAlt: '#16254a',
    border: '#243560',
    text: '#ffffff',
    textMuted: '#9aa6c4',
    primary: '#ba8109',
    onPrimary: '#ffffff',
    success: '#34d399',
    danger: '#f87171',
    warning: '#fbbf24',
    highlight: '#7a5a12',
    cellSelected: '#3b4f86',
    cellPeer: '#1b2b55',
    cellConflict: '#5b1f2c',
  },
};

export function mergeTheme(base: SageTheme, override?: PartialTheme): SageTheme {
  if (!override) return base;
  return {
    colors: { ...base.colors, ...override.colors },
    radii: { ...base.radii, ...override.radii },
    spacing: { ...base.spacing, ...override.spacing },
    fonts: { ...base.fonts, ...override.fonts },
  };
}
