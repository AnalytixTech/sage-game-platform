import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE, exportJson, exportSnippet, sanitize, themeOverrides } from '../src/themeExport';

describe('theme studio export', () => {
  it('exports a preset with no overrides as the bare preset', () => {
    const code = exportSnippet(DEFAULT_STATE, '@sagegames/react-native');
    expect(code).toContain("import { allGames, arcadeTheme, SageGameProvider } from '@sagegames/react-native';");
    expect(code).toContain('const theme = arcadeTheme;');
    expect(code).not.toContain('themeOverrides');
  });

  it('exports a brand theme through createTheme, with only the options that differ', () => {
    const code = exportSnippet({ ...DEFAULT_STATE, base: 'brand', brand: '#BA8109', radius: 'round', font: 'Montserrat' }, '@sagegames/react');
    expect(code).toContain("from '@sagegames/react'");
    expect(code).toContain("brand: '#ba8109'");
    expect(code).toContain("radius: 'round'");
    expect(code).toContain("font: 'Montserrat'");
    expect(code).not.toContain('motion:'); // full motion is the default
  });

  it('puts preset tweaks in themeOverrides', () => {
    const s = { ...DEFAULT_STATE, preset: 'light' as const, radius: 'sharp' as const, motion: 'none' as const, celebrations: false, density: 'compact' as const, colors: { primary: '#10B981' } };
    expect(themeOverrides(s)).toEqual({
      colors: { primary: '#10b981' },
      radii: { sm: 4, md: 6, lg: 8, xl: 12 },
      motion: { scale: 0, celebrations: false },
      density: 'compact',
    });
    expect(exportSnippet(s, '@sagegames/react-native')).toContain('themeOverrides={themeOverrides}');
  });

  it('cleans what it is given (the state comes from inputs and localStorage)', () => {
    const s = sanitize({ brand: 'red', font: "Evil'); alert(1); //", colors: { primary: 'javascript:1', 'bad key': '#ffffff', text: '#FFFFFF' }, preset: 'nope' as never });
    expect(s.brand).toBe(DEFAULT_STATE.brand);
    expect(s.font).not.toMatch(/['"`]/);
    expect(s.colors).toEqual({ text: '#ffffff' });
    expect(s.preset).toBe('arcade');
    // A broken font name can't break out of the generated string.
    expect(exportSnippet({ ...DEFAULT_STATE, base: 'brand', font: "a'b" }, '@sagegames/react')).toContain("font: 'ab'");
  });

  it('never includes credentials', () => {
    const code = exportSnippet({ ...DEFAULT_STATE, base: 'brand' }, '@sagegames/react-native') + exportJson(DEFAULT_STATE);
    expect(code).not.toMatch(/sk_(live|test)_|stk_|whsec_/);
  });

  it('JSON export round-trips', () => {
    expect(JSON.parse(exportJson({ ...DEFAULT_STATE, base: 'brand', brand: '#123456' }))).toEqual({ createTheme: { brand: '#123456', mode: 'dark' }, themeOverrides: {} });
  });
});
