import { describe, expect, it } from "vitest";
import { contrastRatio, oklchToHex, parseColor, rgbToOklch, toHex } from "./color";
import { nearestPalette, PALETTE, PALETTE_HEX, paletteVar } from "@/lib/constants/palette";

describe("colour conversion", () => {
  it("converts OKLCH to sRGB hex", () => {
    expect(oklchToHex(1, 0, 0)).toBe("#ffffff");
    expect(oklchToHex(0, 0, 0)).toBe("#000000");
    // Reference: oklch(0.6279 0.2577 29.23) ≈ #ff0000
    expect(toHex("oklch(0.62796 0.25768 29.2339)")).toBe("#ff0000");
  });
  it("parses hex, rgb and oklch (with alpha)", () => {
    expect(parseColor("#0fb5ba")).toEqual({ r: 15, g: 181, b: 186, a: 1 });
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor("rgb(10 20 30 / 50%)")).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
    expect(parseColor("rgba(10, 20, 30, 0.25)")).toEqual({ r: 10, g: 20, b: 30, a: 0.25 });
    expect(toHex("oklch(1 0 0 / 0.5)")).toBe("#ffffff80");
    expect(toHex("oklch(50% 0 0)")).toBe(toHex("oklch(0.5 0 0)"));
    expect(parseColor("var(--x)")).toBeNull();
    expect(parseColor("color-mix(in oklab, red, blue)")).toBeNull();
  });
  it("round-trips sRGB → OKLCH → sRGB", () => {
    for (const hex of ["#39abaa", "#d78075", "#147174", "#f7fbfb"]) {
      const { l, c, h } = rgbToOklch(parseColor(hex)!);
      expect(oklchToHex(l, c, h)).toBe(hex);
    }
  });
});

describe("design token contrast (WCAG)", () => {
  it("accent text on white ≥ 4.5:1", () => {
    expect(contrastRatio("oklch(0.5 0.08 198)", "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
  it("primary button label ≥ 3:1 (large/bold UI text)", () => {
    expect(contrastRatio("#ffffff", "oklch(0.62 0.1 195)")).toBeGreaterThanOrEqual(3);
  });
  it("body text on canvas, both themes ≥ 7:1", () => {
    expect(contrastRatio("oklch(0.22 0.015 215)", "oklch(0.985 0.004 200)")).toBeGreaterThanOrEqual(7);
    expect(contrastRatio("oklch(0.97 0.005 200)", "oklch(0.16 0.012 215)")).toBeGreaterThanOrEqual(7);
  });
  it("secondary text fg-2 ≥ 4.5:1 in both themes", () => {
    expect(contrastRatio("oklch(0.42 0.015 215)", "oklch(0.985 0.004 200)")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("oklch(0.82 0.012 205)", "oklch(0.22 0.013 215)")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("palette", () => {
  it("has 10 muted hues with storable hex values", () => {
    expect(PALETTE).toHaveLength(10);
    for (const hex of PALETTE_HEX) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    for (const p of PALETTE) {
      expect(p.light.c).toBeLessThanOrEqual(0.11);
      expect(p.light.l).toBeGreaterThanOrEqual(0.62);
    }
  });
  it("snaps legacy saturated colours to the nearest muted hue", () => {
    expect(nearestPalette("#0fb5ba")?.id).toBe("teal");
    expect(nearestPalette("#ff6b6b")?.id).toBe("coral");
    expect(nearestPalette("#7c5cff")?.id).toBe("indigo");
    expect(nearestPalette("#9aa9ab")).toBeNull(); // grey
    expect(paletteVar("#9aa9ab")).toBe("var(--warm-archive)");
    expect(paletteVar(PALETTE[3]!.hex)).toBe("var(--palette-violet)");
  });
});
