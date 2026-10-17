/**
 * Category / tag palette: ten muted hues at matched lightness (L≈.68, C≈.10) so no colour
 * shouts louder than another. Each entry has a light- and dark-mode OKLCH value (mirrored as
 * `--palette-<id>` CSS variables in globals.css) and a `hex` for storage — the categories API
 * validates colours as `#rrggbb`.
 *
 * Render with `paletteVar(storedHex)` so legacy (saturated) colours snap to the nearest muted
 * hue and dark mode gets its own variant automatically.
 */
import { oklchToHex, parseColor, rgbToOklch } from "@/lib/design/color";

export type PaletteId = "teal" | "sky" | "indigo" | "violet" | "rose" | "coral" | "orange" | "amber" | "lime" | "green";

export type PaletteEntry = {
  id: PaletteId;
  label: string;
  hue: number;
  /** OKLCH components for light / dark themes. */
  light: { l: number; c: number };
  dark: { l: number; c: number };
};

const P = (id: PaletteId, label: string, hue: number, l: number, c: number, dl: number): PaletteEntry => ({
  id,
  label,
  hue,
  light: { l, c },
  dark: { l: dl, c },
});

export const PALETTE_ENTRIES: readonly PaletteEntry[] = [
  P("teal", "Teal", 194, 0.68, 0.1, 0.74),
  P("sky", "Sky", 235, 0.68, 0.1, 0.74),
  P("indigo", "Indigo", 270, 0.64, 0.1, 0.7),
  P("violet", "Violet", 305, 0.66, 0.1, 0.72),
  P("rose", "Rose", 350, 0.68, 0.1, 0.73),
  P("coral", "Coral", 28, 0.69, 0.11, 0.73),
  P("orange", "Orange", 58, 0.72, 0.1, 0.76),
  P("amber", "Amber", 85, 0.78, 0.1, 0.8),
  P("lime", "Lime", 128, 0.74, 0.1, 0.78),
  P("green", "Green", 158, 0.68, 0.1, 0.73),
];

export const oklchString = ({ l, c }: { l: number; c: number }, hue: number) => `oklch(${l} ${c} ${hue})`;

/** Light/dark OKLCH strings, CSS variable and storage hex for every palette entry. */
export const PALETTE = PALETTE_ENTRIES.map((p) => ({
  ...p,
  cssVar: `var(--palette-${p.id})`,
  lightCss: oklchString(p.light, p.hue),
  darkCss: oklchString(p.dark, p.hue),
  hex: oklchToHex(p.light.l, p.light.c, p.hue),
}));

export type PaletteColor = (typeof PALETTE)[number];

/** Storage hex values (`#rrggbb`) — use as the colour choices in pickers. */
export const PALETTE_HEX: readonly string[] = PALETTE.map((p) => p.hex);

const hueDistance = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/** Nearest palette entry for any colour string (hex/rgb/oklch). Greys map to `null`. */
export function nearestPalette(color: string | null | undefined): PaletteColor | null {
  if (!color) return null;
  const exact = PALETTE.find((p) => p.hex === color.toLowerCase());
  if (exact) return exact;
  const rgba = parseColor(color);
  if (!rgba) return null;
  const { c, h } = rgbToOklch(rgba);
  if (c < 0.03) return null;
  let best = PALETTE[0]!;
  let bestD = Infinity;
  for (const p of PALETTE) {
    const d = hueDistance(p.hue, h);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/**
 * CSS colour for a stored category colour: the matching muted palette variable (theme-aware),
 * or a neutral for greys / unparseable input.
 */
export function paletteVar(color: string | null | undefined): string {
  return nearestPalette(color)?.cssVar ?? "var(--warm-archive)";
}

/** Deterministic palette entry for a string (avatars, fallbacks). */
export function paletteFor(seed: string): PaletteColor {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}
