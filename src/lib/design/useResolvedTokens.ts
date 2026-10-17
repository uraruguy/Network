"use client";
/**
 * Resolve CSS custom properties to concrete colour strings for WebGL / canvas consumers
 * (three.js, react-globe.gl, force-graph), which can't read `var(--…)` or (reliably) OKLCH.
 *
 *   const c = useResolvedTokens(["--accent", "--warm-inner", "--fg"] as const);
 *   // → { "--accent": "#39abaa", "--warm-inner": "#d77a6c", "--fg": "#1b2427" }
 *
 * Values re-resolve when the theme flips. Colours come back as `#rrggbb` (or `#rrggbbaa`
 * when translucent) so they work everywhere, including `${hex}33`-style alpha suffixing.
 */
import { useMemo } from "react";
import { useResolvedTheme, type ResolvedTheme } from "@/lib/theme";
import { parseColor, rgbToHex } from "./color";

let probe: CanvasRenderingContext2D | null | undefined;

/** Canvas fallback for colour syntaxes `parseColor` doesn't handle (named, color-mix …). */
function canvasToHex(value: string): string | null {
  if (typeof document === "undefined") return null;
  if (probe === undefined) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    probe = canvas.getContext("2d", { willReadFrequently: true });
  }
  if (!probe) return null;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = "#000";
  probe.fillStyle = value;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
  return rgbToHex({ r: r!, g: g!, b: b!, a: (a ?? 255) / 255 });
}

/** Resolve one custom property (e.g. "--accent") on `el` (default <html>) to a hex colour. */
export function readCssColor(name: string, el?: Element | null): string | null {
  if (typeof window === "undefined") return null;
  const target = el ?? document.documentElement;
  const raw = getComputedStyle(target).getPropertyValue(name).trim();
  if (!raw) return null;
  const parsed = parseColor(raw);
  if (parsed) return rgbToHex(parsed);
  // Nested var() / color-mix(): let the browser compute it on a probe element.
  if (raw.includes("var(") || raw.includes("color-mix(")) {
    const span = document.createElement("span");
    span.style.color = raw;
    span.style.display = "none";
    target.appendChild(span);
    const computed = getComputedStyle(span).color;
    span.remove();
    return parseColor(computed) ? rgbToHex(parseColor(computed)!) : canvasToHex(computed);
  }
  return canvasToHex(raw);
}

/** Non-hook variant: resolve a list of tokens right now. */
export function resolveTokens<const T extends readonly string[]>(names: T, el?: Element | null): Record<T[number], string> {
  const out = {} as Record<T[number], string>;
  for (const n of names) out[n as T[number]] = readCssColor(n, el) ?? "#000000";
  return out;
}

/**
 * Hook: resolved colours for `names`, recomputed on theme change. Pass a stable array
 * (module constant or `as const` literal joined into the memo key).
 */
export function useResolvedTokens<const T extends readonly string[]>(names: T): Record<T[number], string> & { theme: ResolvedTheme } {
  const theme = useResolvedTheme();
  const key = names.join(",");
  return useMemo(
    () => ({ ...resolveTokens(names), theme }),
    // `names` is captured by its joined key; theme drives re-resolution.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, theme],
  );
}
