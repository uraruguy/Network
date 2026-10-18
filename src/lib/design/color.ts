/**
 * Tiny, dependency-free colour maths for the design system.
 *
 * Tokens are authored in OKLCH (see `globals.css`). Some consumers can't take OKLCH strings —
 * WebGL (three.js), older canvas implementations, the `theme-color` meta tag, and the category
 * colour column (validated as `#rrggbb`). These helpers convert between OKLCH and sRGB hex.
 */

export type Rgba = { r: number; g: number; b: number; a: number }; // r,g,b 0–255, a 0–1
export type Oklch = { l: number; c: number; h: number; a?: number }; // l 0–1, c ≥0, h degrees

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const toGamma = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
const toLinear = (x: number) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));

/** OKLCH → sRGB (gamut-clipped). */
export function oklchToRgb({ l, c, h, a = 1 }: Oklch): Rgba {
  const hr = (h * Math.PI) / 180;
  const A = c * Math.cos(hr);
  const B = c * Math.sin(hr);
  const l_ = l + 0.3963377774 * A + 0.2158037573 * B;
  const m_ = l - 0.1055613458 * A - 0.0638541728 * B;
  const s_ = l - 0.0894841775 * A - 1.291485548 * B;
  const L = l_ ** 3, M = m_ ** 3, S = s_ ** 3;
  const r = 4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S;
  const g = -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S;
  const b = -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S;
  return {
    r: Math.round(clamp01(toGamma(r)) * 255),
    g: Math.round(clamp01(toGamma(g)) * 255),
    b: Math.round(clamp01(toGamma(b)) * 255),
    a: clamp01(a),
  };
}

/** sRGB → OKLCH. */
export function rgbToOklch({ r, g, b, a = 1 }: Partial<Rgba> & { r: number; g: number; b: number }): Oklch {
  const R = toLinear(r / 255), G = toLinear(g / 255), B = toLinear(b / 255);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.sqrt(A * A + Bb * Bb);
  let h = (Math.atan2(Bb, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h: c < 1e-4 ? 0 : h, a };
}

const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, "0");

export function rgbToHex({ r, g, b, a = 1 }: Rgba): string {
  return `#${hex2(r)}${hex2(g)}${hex2(b)}${a < 1 ? hex2(a * 255) : ""}`;
}

const num = (s: string, pctScale = 1) => (s.endsWith("%") ? (parseFloat(s) / 100) * pctScale : parseFloat(s));

/**
 * Parses `#rgb[a]`, `#rrggbb[aa]`, `rgb()/rgba()` (comma or space syntax) and `oklch()`.
 * Returns null for anything else (named colours, `color-mix()`, `var()` …).
 */
export function parseColor(input: string): Rgba | null {
  const s = input.trim().toLowerCase();
  if (s.startsWith("#")) {
    let h = s.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map((ch) => ch + ch).join("");
    if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(h)) return null;
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    };
  }
  const fn = /^(rgba?|oklch)\((.*)\)$/.exec(s);
  if (!fn) return null;
  const [, name, body] = fn as unknown as [string, string, string];
  const [main, alphaPart] = body.includes("/") ? body.split("/") : [body, undefined];
  const parts = main!.trim().split(/[\s,]+/).filter(Boolean);
  let alpha = alphaPart !== undefined ? num(alphaPart.trim()) : 1;
  if (name.startsWith("rgb")) {
    if (parts.length === 4) alpha = num(parts[3]!);
    if (parts.length < 3) return null;
    const [r, g, b] = parts.slice(0, 3).map((p) => num(p, 255));
    if ([r, g, b].some((v) => Number.isNaN(v))) return null;
    return { r: r!, g: g!, b: b!, a: Number.isNaN(alpha) ? 1 : alpha };
  }
  if (parts.length < 3) return null;
  const l = num(parts[0]!);
  const c = num(parts[1]!, 0.4);
  const h = parseFloat(parts[2]!);
  if ([l, c, h].some((v) => Number.isNaN(v))) return null;
  return oklchToRgb({ l, c, h, a: Number.isNaN(alpha) ? 1 : alpha });
}

/** Any parseable colour → `#rrggbb[aa]`, or null. */
export function toHex(input: string): string | null {
  const rgba = parseColor(input);
  return rgba ? rgbToHex(rgba) : null;
}

export function oklchToHex(l: number, c: number, h: number): string {
  return rgbToHex(oklchToRgb({ l, c, h }));
}

/** WCAG 2 relative luminance → contrast ratio between two colours. */
export function contrastRatio(a: string, b: string): number {
  const lum = (x: string) => {
    const c = parseColor(x);
    if (!c) return 0;
    return 0.2126 * toLinear(c.r / 255) + 0.7152 * toLinear(c.g / 255) + 0.0722 * toLinear(c.b / 255);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
