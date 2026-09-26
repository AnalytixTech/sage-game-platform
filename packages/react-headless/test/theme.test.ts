import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  arcadeTheme,
  contrast,
  createTheme,
  darkNavyTheme,
  gameAccent,
  lightTheme,
  mergeTheme,
  minimalTheme,
  motionMs,
  presets,
  resolveTheme,
  SageTheme,
} from '@sagegames/react-headless';

const hexColor = fc
  .tuple(fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }))
  .map(([r, g, b]) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`);

/** Every text/background pair a view draws, with the ratio it needs. */
function contrastProblems(t: SageTheme): string[] {
  const c = t.colors;
  const checks: [string, string, string, number][] = [
    ['text/background', c.text, c.background, 4.5],
    ['text/surface', c.text, c.surface, 4.5],
    ['text/surfaceAlt', c.text, c.surfaceAlt, 4.5],
    ['text/surfaceRaised', c.text, c.surfaceRaised, 4.5],
    ['textMuted/surface', c.textMuted, c.surface, 4.5],
    ['textMuted/surfaceAlt', c.textMuted, c.surfaceAlt, 4.5],
    ['onPrimary/primary', c.onPrimary, c.primary, 4.5],
    ['onPrimary/primaryAlt', c.onPrimary, c.primaryAlt, 4.5],
    ['text/cellSelected', c.text, c.cellSelected, 4.5],
    ['text/cellPeer', c.text, c.cellPeer, 4.5],
    ['text/cellConflict', c.text, c.cellConflict, 4.5],
    ['success/surface', c.success, c.surface, 4.5],
    ['danger/surface', c.danger, c.surface, 4.5],
    ['warning/surface', c.warning, c.surface, 4.5],
    ['primary/background', c.primary, c.background, 3],
  ];
  return checks.filter(([, fg, bg, ratio]) => contrast(fg, bg) < ratio).map(([name, fg, bg]) => `${name} ${fg} on ${bg}: ${contrast(fg, bg).toFixed(2)}`);
}

describe('createTheme', () => {
  it('meets WCAG AA for every text colour, for any brand colour, dark and light', () => {
    fc.assert(
      fc.property(hexColor, fc.constantFrom('dark' as const, 'light' as const), (brand, mode) => {
        expect(contrastProblems(createTheme({ brand, mode }))).toEqual([]);
      }),
      { numRuns: 200 }
    );
  });

  it('keeps the brand colour when it already works', () => {
    const t = createTheme({ brand: '#1d4ed8', mode: 'light' });
    expect(t.colors.primary).toBe('#1d4ed8');
    expect(t.colors.onPrimary).toBe('#ffffff');
    expect(t.gradients.primary).toEqual([t.colors.primary, t.colors.primaryAlt]);
  });

  it('applies the options', () => {
    const t = createTheme({ brand: '#e11d48', mode: 'dark', radius: 'sharp', font: 'Montserrat', motion: 'none', density: 'compact' });
    expect(t.mode).toBe('dark');
    expect(t.radii.md).toBe(6);
    expect(t.fonts).toEqual({ regular: 'Montserrat', medium: 'Montserrat', bold: 'Montserrat' });
    expect(t.motion.scale).toBe(0);
    expect(t.motion.celebrations).toBe(false);
    expect(t.density).toBe('compact');
    expect(createTheme({ brand: '#e11d48', font: { bold: 'Inter-Bold' } }).fonts).toEqual({ regular: '', medium: '', bold: 'Inter-Bold' });
  });

  it('rejects colours it cannot work with', () => {
    expect(() => createTheme({ brand: 'tomato' })).toThrow(/hex/);
  });
});

describe('presets', () => {
  it('are complete themes', () => {
    for (const t of Object.values(presets)) {
      expect(t.colors.gameAccents.quiz).toMatch(/^#/);
      expect(t.gradients.hero).toHaveLength(2);
      expect(t.elevation.md.radius).toBeGreaterThan(0);
      expect(t.typography.display.size).toBeGreaterThan(t.typography.body.size);
    }
  });

  it('generated presets meet AA', () => {
    expect(contrastProblems(arcadeTheme)).toEqual([]);
    expect(contrastProblems(minimalTheme)).toEqual([]);
  });

  it('keeps the 2.0 colours of darkNavy and light', () => {
    expect(darkNavyTheme.colors.primary).toBe('#ba8109');
    expect(darkNavyTheme.colors.background).toBe('#000b21');
    expect(darkNavyTheme.mode).toBe('dark');
    expect(lightTheme.colors.primary).toBe('#4f46e5');
    expect(lightTheme.mode).toBe('light');
  });

  it('minimal is flat and calm', () => {
    expect(minimalTheme.gradients.primary[0]).toBe(minimalTheme.gradients.primary[1]);
    expect(minimalTheme.motion.celebrations).toBe(false);
  });
});

describe('mergeTheme', () => {
  it('merges deeply', () => {
    const t = mergeTheme(arcadeTheme, { colors: { textMuted: '#abcdef' }, radii: { md: 3 }, motion: { durations: { fast: 50 } } });
    expect(t.colors.textMuted).toBe('#abcdef');
    expect(t.colors.text).toBe(arcadeTheme.colors.text);
    expect(t.radii).toEqual({ ...arcadeTheme.radii, md: 3 });
    expect(t.motion.durations).toEqual({ ...arcadeTheme.motion.durations, fast: 50 });
    expect(arcadeTheme.radii.md).not.toBe(3); // the base is untouched
  });

  it('derived tokens follow the colours they come from', () => {
    const t = mergeTheme(arcadeTheme, { colors: { primary: '#ff0000' } });
    expect(t.gradients.primary[0]).toBe('#ff0000');
    expect(t.colors.primaryAlt).not.toBe(arcadeTheme.colors.primaryAlt);
    expect(t.gradients.primary[1]).toBe(t.colors.primaryAlt);
    expect(t.colors.focus).toBe('#ff0000');
    // …unless the override sets them too.
    const kept = mergeTheme(arcadeTheme, { colors: { primary: '#ff0000' }, gradients: { primary: ['#000000', '#111111'] } });
    expect(kept.gradients.primary).toEqual(['#000000', '#111111']);
  });

  it('switching the background to light switches the mode, shadows and accents', () => {
    const t = mergeTheme(arcadeTheme, { colors: { background: '#ffffff' } });
    expect(t.mode).toBe('light');
    expect(t.elevation.md.opacity).toBeLessThan(arcadeTheme.elevation.md.opacity);
  });

  it('replaces arrays instead of merging them', () => {
    expect(mergeTheme(arcadeTheme, { colors: { foundPalette: ['#ffffff'] } }).colors.foundPalette).toEqual(['#ffffff']);
  });
});

describe('resolveTheme (2.1-style themes)', () => {
  it('fills in the new tokens from a colours-only theme', () => {
    const legacy = {
      colors: {
        background: '#101010', surface: '#1a1a1a', surfaceAlt: '#222222', border: '#333333', text: '#ffffff', textMuted: '#aaaaaa',
        primary: '#00aa55', onPrimary: '#ffffff', success: '#34d399', danger: '#f87171', warning: '#fbbf24', highlight: '#444444',
        cellSelected: '#335544', cellPeer: '#1f2a24', cellConflict: '#552222',
      },
      radii: { sm: 2, md: 4, lg: 6 },
      spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
      fonts: { regular: '', medium: '', bold: '' },
    };
    const t = resolveTheme(legacy, arcadeTheme);
    expect(t.colors.primary).toBe('#00aa55');
    expect(t.gradients.primary[0]).toBe('#00aa55');
    expect(t.radii.md).toBe(4);
    expect(t.radii.xl).toBe(arcadeTheme.radii.xl);
    expect(t.typography).toEqual(arcadeTheme.typography);
    expect(t.colors.overlay).toMatch(/^rgba\(16, 16, 16/);
  });

  it('copes with colours that are not hex', () => {
    const t = resolveTheme({ colors: { primary: 'rebeccapurple', background: 'black' } }, arcadeTheme);
    expect(t.colors.primary).toBe('rebeccapurple');
    expect(t.gradients.primary[0]).toBe('rebeccapurple');
  });
});

describe('helpers', () => {
  it('gameAccent maps game ids to accents', () => {
    expect(gameAccent(arcadeTheme, 'game_quiz_001')).toBe(arcadeTheme.colors.gameAccents.quiz);
    expect(gameAccent(arcadeTheme, 'unknown')).toBe(arcadeTheme.colors.primary);
  });

  it('motionMs scales durations and switches off for reduced motion', () => {
    expect(motionMs(arcadeTheme, 'base', false)).toBe(arcadeTheme.motion.durations.base);
    expect(motionMs(mergeTheme(arcadeTheme, { motion: { scale: 2 } }), 'base', false)).toBe(arcadeTheme.motion.durations.base * 2);
    expect(motionMs(arcadeTheme, 'base', true)).toBe(0);
    expect(motionMs(mergeTheme(arcadeTheme, { motion: { scale: 0 } }), 'base', false)).toBe(0);
  });
});
