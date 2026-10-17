import { describe, expect, it } from "vitest";
import type { LayerSpecification } from "maplibre-gl";
import { oklchToHex, parseColor } from "@/lib/design/color";
import { buildStyle, EXCLUDED_SOURCE_LAYERS, LAYER, MAP_TOKENS, mapPalette, OVERLAY_SOURCES, SRC, tone, type MapTokens } from "./map-style";

/** Plausible resolved tokens (what useResolvedTokens returns) for each theme. */
function tokens(dark: boolean): MapTokens {
  const t = {} as MapTokens;
  for (const name of MAP_TOKENS) t[name] = dark ? oklchToHex(0.3, 0.02, 210) : oklchToHex(0.9, 0.02, 200);
  t["--bg"] = dark ? oklchToHex(0.16, 0.012, 215) : oklchToHex(0.985, 0.004, 200);
  t["--accent"] = oklchToHex(0.67, 0.1, 194);
  t["--surface-solid"] = dark ? oklchToHex(0.21, 0.013, 215) : oklchToHex(1, 0, 0);
  return t;
}

const sourceLayer = (l: LayerSpecification) => ("source-layer" in l ? l["source-layer"] : undefined);
const source = (l: LayerSpecification) => ("source" in l ? (l.source as string) : undefined);

function colours(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string" && value.startsWith("#")) out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => colours(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => colours(v, out));
  return out;
}

describe.each(["light", "dark"] as const)("buildStyle (%s)", (mode) => {
  const style = buildStyle({ mode, tokens: tokens(mode === "dark") });

  it("is a v8 globe style on OpenFreeMap", () => {
    expect(style.version).toBe(8);
    expect(style.projection?.type).toBe("globe");
    expect(style.glyphs).toMatch(/^https:\/\/tiles\.openfreemap\.org\/fonts\/\{fontstack\}\/\{range\}\.pbf$/);
    expect(style.sources[SRC.basemap]).toMatchObject({ type: "vector", url: "https://tiles.openfreemap.org/planet" });
  });

  it("has unique layer ids", () => {
    const ids = style.layers.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("stays minimal: no POI / house number / peak / airport layers", () => {
    for (const l of style.layers) expect(EXCLUDED_SOURCE_LAYERS).not.toContain(sourceLayer(l));
    expect(style.layers.filter((l) => source(l) === SRC.basemap).length).toBeLessThanOrEqual(26);
  });

  it("references only declared sources", () => {
    for (const l of style.layers) {
      const s = source(l);
      if (s) expect(style.sources[s], `${l.id} → ${s}`).toBeDefined();
    }
  });

  it("declares the people overlay (clustered cities, arcs with line metrics, home)", () => {
    for (const id of OVERLAY_SOURCES) expect(style.sources[id]).toBeDefined();
    expect(style.sources[SRC.cities]).toMatchObject({ type: "geojson", cluster: true, clusterRadius: 48, clusterMaxZoom: 9 });
    expect(style.sources[SRC.cities]).toHaveProperty("clusterProperties.people");
    expect(style.sources[SRC.arcs]).toMatchObject({ lineMetrics: true });
    const ids = style.layers.map((l) => l.id);
    for (const id of Object.values(LAYER)) expect(ids).toContain(id);
    // Clusters and city dots draw above every basemap label.
    const lastLabel = Math.max(...style.layers.map((l, i) => (l.type === "symbol" && source(l) === SRC.basemap ? i : -1)));
    expect(ids.indexOf(LAYER.cluster)).toBeGreaterThan(lastLabel);
    expect(ids.indexOf(LAYER.cityDot)).toBeGreaterThan(lastLabel);
  });

  it("uses single-font stacks OpenFreeMap can serve", () => {
    for (const l of style.layers) {
      if (l.type !== "symbol") continue;
      const font = l.layout?.["text-font"];
      expect(Array.isArray(font) && font.length === 1, l.id).toBe(true);
    }
  });

  it("only emits parseable colours", () => {
    const all = colours(style.layers).concat(colours(style.sky));
    expect(all.length).toBeGreaterThan(20);
    for (const c of all) expect(parseColor(c), c).not.toBeNull();
  });

  it("fades the atmosphere out towards street level", () => {
    expect(style.sky?.["atmosphere-blend"]).toEqual(expect.arrayContaining(["interpolate"]));
  });
});

describe("mapPalette", () => {
  it("light water is lighter than dark water, and dark land is darker than light land", () => {
    const light = mapPalette("light", tokens(false));
    const dark = mapPalette("dark", tokens(true));
    const L = (hex: string) => {
      const { r, g, b } = parseColor(hex)!;
      return r + g + b;
    };
    expect(L(light.water)).toBeGreaterThan(L(dark.water));
    expect(L(light.land)).toBeGreaterThan(L(dark.land));
    expect(L(light.land)).toBeGreaterThan(L(light.water));
  });

  it("tone() replaces or offsets OKLCH components", () => {
    const base = oklchToHex(0.6, 0.1, 194);
    expect(tone(base, {})).toBe(base);
    expect(tone(base, { l: 0.9 })).not.toBe(base);
    expect(tone(base, { dl: 1 })).toBe(tone(base, { l: 1 }));
  });
});
