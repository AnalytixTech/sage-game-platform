/**
 * Small colour helpers for building themes: hex ↔ HSL, mixing, and WCAG contrast.
 * Accepts #rgb, #rrggbb and #rrggbbaa; always returns lowercase #rrggbb (or rgba() for alpha).
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

export function parseHex(hex: string): Rgb {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(h)) throw new Error(`Not a hex colour: ${hex}`);
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

export function isHex(value: string): boolean {
  return /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value.trim());
}

export function toHex({ r, g, b }: Rgb): string {
  const p = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
  return `#${p(r)}${p(g)}${p(b)}`;
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rr) h = (gg - bb) / d + (gg < bb ? 6 : 0);
  else if (max === gg) h = (bb - rr) / d + 2;
  else h = (rr - gg) / d + 4;
  return { h: h * 60, s, l };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const hh = (((h % 360) + 360) % 360) / 360;
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return { r: f(hh + 1 / 3) * 255, g: f(hh) * 255, b: f(hh - 1 / 3) * 255 };
}

export const toHsl = (hex: string): Hsl => rgbToHsl(parseHex(hex));
export const fromHsl = (hsl: Hsl): string => toHex(hslToRgb({ h: hsl.h, s: clamp(hsl.s), l: clamp(hsl.l) }));

/** Same hue and saturation, new lightness (0..1). */
export const withLightness = (hex: string, l: number): string => fromHsl({ ...toHsl(hex), l });

/** Blend `a` towards `b` (amount 0 = a, 1 = b). */
export function mix(a: string, b: string, amount: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  const t = clamp(amount);
  return toHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t });
}

/** Rotate the hue by `degrees`. */
export const shiftHue = (hex: string, degrees: number): string => {
  const hsl = toHsl(hex);
  return fromHsl({ ...hsl, h: hsl.h + degrees });
};

export function alpha(hex: string, a: number): string {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.round(clamp(a) * 1000) / 1000})`;
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio (1..21). */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export const isDark = (hex: string): boolean => luminance(hex) < 0.18;

/** Black or white, whichever reads better on `bg`. */
export const readableOn = (bg: string): string => (contrast('#ffffff', bg) >= contrast('#111111', bg) ? '#ffffff' : '#111111');

/**
 * Move `fg`'s lightness away from `bg` until the contrast reaches `ratio` (keeping its hue),
 * falling back to black or white if no shade of the hue gets there.
 */
export function ensureContrast(fg: string, bg: string, ratio = 4.5): string {
  if (contrast(fg, bg) >= ratio) return fg;
  const hsl = toHsl(fg);
  // Go the way that has more room: lighter on backgrounds where white reads better.
  const lighter = readableOn(bg) === '#ffffff';
  for (let i = 1; i <= 40; i++) {
    const l = clamp(hsl.l + (lighter ? 1 : -1) * i * 0.025);
    const candidate = fromHsl({ ...hsl, l });
    if (contrast(candidate, bg) >= ratio) return candidate;
  }
  return readableOn(bg);
}
