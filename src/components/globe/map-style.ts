/**
 * The globe's MapLibre style — hand-written, minimal, Apple-Maps-calm.
 *
 * Basemap: OpenFreeMap vector tiles (OpenMapTiles schema) + OpenFreeMap glyphs, no API key, no
 * POIs. Every colour is derived from the app's design tokens (resolved to hex by
 * `useResolvedTokens`) by nudging OKLCH lightness/chroma/hue, so the map follows the palette
 * and the light/dark theme. `buildStyle` is pure: no DOM, no MapLibre runtime import.
 *
 * Overlay sources (`people-*`) are part of the style with empty data; MapCanvas fills them with
 * `setData` and carries them across theme swaps (`setStyle(…, { diff: true, transformStyle })`).
 */
import type {
  ExpressionSpecification,
  FilterSpecification,
  LayerSpecification,
  SkySpecification,
  SourceSpecification,
  StyleSpecification,
} from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import { oklchToHex, parseColor, rgbToHex, rgbToOklch } from "@/lib/design/color";

export type MapMode = "light" | "dark";

/** Tokens the style reads. Pass this (stable) list to `useResolvedTokens`. */
export const MAP_TOKENS = [
  "--bg",
  "--bg-2",
  "--bg-3",
  "--fg",
  "--fg-2",
  "--fg-3",
  "--fg-4",
  "--accent",
  "--accent-fill",
  "--accent-strong",
  "--accent-fg",
  "--accent-50",
  "--accent-100",
  "--accent-200",
  "--accent-300",
  "--accent-400",
  "--accent-700",
  "--accent-900",
  "--accent-950",
  "--surface-solid",
  "--success",
  "--warm-dormant",
  "--warm-inner",
] as const;

export type MapTokenName = (typeof MAP_TOKENS)[number];
export type MapTokens = Record<MapTokenName, string>;

/* ---------- endpoints ---------- */

export const OFM_ORIGIN = "https://tiles.openfreemap.org";
export const OFM_TILEJSON = `${OFM_ORIGIN}/planet`;
export const OFM_GLYPHS = `${OFM_ORIGIN}/fonts/{fontstack}/{range}.pbf`;

/** OpenFreeMap serves single-font stacks only (no comma-combined stacks). */
const FONT = { regular: ["Noto Sans Regular"], bold: ["Noto Sans Bold"], italic: ["Noto Sans Italic"] };

/* ---------- ids ---------- */

export const SRC = {
  basemap: "openmaptiles",
  cities: "people-cities",
  arcs: "people-arcs",
  home: "people-home",
} as const;

export const OVERLAY_SOURCES: readonly string[] = [SRC.cities, SRC.arcs, SRC.home];

export const LAYER = {
  arcs: "people-arcs",
  homeHalo: "people-home-halo",
  home: "people-home",
  clusterHalo: "people-cluster-halo",
  cluster: "people-cluster",
  clusterCount: "people-cluster-count",
  cityDot: "people-city-dot",
} as const;

export const CLUSTER = { radius: 48, maxZoom: 9 } as const;

/** Source-layers we never render (points of interest and friends). */
export const EXCLUDED_SOURCE_LAYERS = ["poi", "housenumber", "aerodrome_label", "mountain_peak"] as const;

/* ---------- colour maths ---------- */

type Lch = { l: number; c: number; h: number };

function lchOf(hex: string): Lch {
  const rgba = parseColor(hex);
  return rgba ? rgbToOklch(rgba) : { l: 0.5, c: 0, h: 0 };
}

/** A token with OKLCH components replaced (`l`/`c`/`h`) or offset (`dl`/`dc`/`dh`). */
export function tone(hex: string, o: { l?: number; c?: number; h?: number; dl?: number; dc?: number; dh?: number }): string {
  const base = lchOf(hex);
  const l = Math.min(1, Math.max(0, (o.l ?? base.l) + (o.dl ?? 0)));
  const c = Math.max(0, (o.c ?? base.c) + (o.dc ?? 0));
  const h = ((o.h ?? base.h) + (o.dh ?? 0) + 360) % 360;
  return oklchToHex(l, c, h);
}

/** `#rrggbb` → `#rrggbbaa`. */
export function alpha(hex: string, a: number): string {
  const rgba = parseColor(hex);
  return rgba ? rgbToHex({ ...rgba, a: Math.min(1, Math.max(0, a)) }) : hex;
}

export type MapPalette = ReturnType<typeof mapPalette>;

/** Every colour the style uses, derived from the tokens for the given mode. */
export function mapPalette(mode: MapMode, t: MapTokens) {
  const dark = mode === "dark";
  const land = dark ? tone(t["--bg"], { l: 0.245, dc: 0.002 }) : tone(t["--bg-2"], { l: 0.958, c: 0.007 });
  const water = dark ? tone(t["--accent-950"], { l: 0.2, c: 0.03, dh: 12 }) : tone(t["--accent-200"], { l: 0.868, c: 0.042, dh: 16 });
  const road = dark ? tone(land, { dl: 0.095 }) : t["--surface-solid"];
  return {
    land,
    water,
    waterLine: dark ? tone(water, { dl: 0.03 }) : tone(water, { dl: -0.02 }),
    waterLabel: dark ? tone(t["--accent-400"], { l: 0.66, c: 0.045, dh: 12 }) : tone(t["--accent-700"], { l: 0.52, c: 0.06, dh: 12 }),
    ice: dark ? tone(land, { dl: 0.06, c: 0.006 }) : tone(t["--surface-solid"], { l: 0.992 }),
    green: dark ? tone(t["--success"], { l: 0.275, c: 0.03 }) : tone(t["--success"], { l: 0.93, c: 0.038 }),
    sand: dark ? tone(t["--warm-dormant"], { l: 0.27, c: 0.018 }) : tone(t["--warm-dormant"], { l: 0.95, c: 0.028 }),
    residential: dark ? tone(land, { dl: 0.012 }) : tone(land, { dl: -0.012 }),
    building: dark ? tone(land, { dl: 0.04 }) : tone(land, { dl: -0.04, dc: 0.003 }),
    buildingLine: dark ? tone(land, { dl: 0.075 }) : tone(land, { dl: -0.085 }),
    road,
    roadCasing: dark ? tone(land, { dl: -0.035 }) : tone(t["--fg-4"], { l: 0.855, c: 0.012 }),
    highway: dark ? tone(t["--accent-900"], { l: 0.4, c: 0.028 }) : tone(t["--accent-50"], { l: 0.968, c: 0.02 }),
    highwayCasing: dark ? tone(land, { dl: -0.04 }) : tone(t["--accent-300"], { l: 0.82, c: 0.035 }),
    boundary: alpha(t["--fg-4"], dark ? 0.55 : 0.6),
    boundaryState: alpha(t["--fg-4"], dark ? 0.35 : 0.4),
    labelCountry: alpha(t["--fg-3"], 0.92),
    labelCity: t["--fg-2"],
    labelTown: t["--fg-3"],
    labelMinor: alpha(t["--fg-3"], 0.85),
    labelRoad: t["--fg-3"],
    halo: alpha(land, 0.88),
    roadHalo: alpha(road, 0.9),
    // Overlay (people)
    accent: t["--accent"],
    accentFill: t["--accent-fill"],
    accentStrong: t["--accent-strong"],
    onAccent: t["--accent-fg"],
    ring: dark ? tone(land, { dl: 0.06 }) : t["--surface-solid"],
    clusterHalo: alpha(t["--accent"], dark ? 0.22 : 0.2),
    inner: t["--warm-inner"],
    // Sky / atmosphere
    sky: t["--bg"],
    horizon: dark ? t["--accent-900"] : t["--accent-100"],
    fog: dark ? t["--bg-2"] : t["--bg-3"],
  };
}

/* ---------- expression helpers ---------- */

const zoom: ExpressionSpecification = ["zoom"];
const isPolygon: ExpressionSpecification = ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false];
const isLine: ExpressionSpecification = ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false];
const isPoint: ExpressionSpecification = ["match", ["geometry-type"], ["Point", "MultiPoint"], true, false];
const notTunnel: ExpressionSpecification = ["!=", ["coalesce", ["get", "brunnel"], ""], "tunnel"];
const classIn = (...classes: string[]): ExpressionSpecification => ["match", ["get", "class"], classes, true, false];
const name: ExpressionSpecification = ["coalesce", ["get", "name:en"], ["get", "name_en"], ["get", "name:latin"], ["get", "name"]];

/** `interpolate exponential(base) zoom` from [zoom, value] pairs. */
function ramp(stops: [number, number][], base = 1.5): ExpressionSpecification {
  return ["interpolate", ["exponential", base], zoom, ...stops.flat()] as ExpressionSpecification;
}
function linear(stops: [number, number | ExpressionSpecification][]): ExpressionSpecification {
  return ["interpolate", ["linear"], zoom, ...stops.flat()] as ExpressionSpecification;
}

const EMPTY_FC: FeatureCollection = { type: "FeatureCollection", features: [] };

/* ---------- layers ---------- */

function basemapLayers(p: MapPalette): LayerSpecification[] {
  const src = SRC.basemap;
  const roads = (id: string, classes: string[], minzoom: number, color: string, width: ExpressionSpecification, opacity?: ExpressionSpecification | number): LayerSpecification => ({
    id,
    type: "line",
    source: src,
    "source-layer": "transportation",
    minzoom,
    filter: ["all", isLine, notTunnel, classIn(...classes)] as FilterSpecification,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": color, "line-width": width, ...(opacity !== undefined ? { "line-opacity": opacity } : {}) },
  });

  const HIGHWAY = ["motorway", "trunk"];
  const MAJOR = ["primary", "secondary", "tertiary"];
  const MINOR = ["minor", "service"];

  return [
    { id: "background", type: "background", paint: { "background-color": p.land } },
    {
      id: "landcover-ice",
      type: "fill",
      source: src,
      "source-layer": "landcover",
      filter: ["all", isPolygon, ["match", ["get", "subclass"], ["glacier", "ice_shelf"], true, false]] as FilterSpecification,
      paint: { "fill-color": p.ice, "fill-antialias": false },
    },
    {
      id: "landcover-sand",
      type: "fill",
      source: src,
      "source-layer": "landcover",
      minzoom: 8,
      filter: ["all", isPolygon, classIn("sand")] as FilterSpecification,
      paint: { "fill-color": p.sand, "fill-opacity": linear([[8, 0], [10, 0.8]]), "fill-antialias": false },
    },
    {
      id: "landcover-green",
      type: "fill",
      source: src,
      "source-layer": "landcover",
      minzoom: 8,
      filter: ["all", isPolygon, classIn("wood", "grass")] as FilterSpecification,
      paint: { "fill-color": p.green, "fill-opacity": linear([[8, 0], [10, 0.75], [15, 0.55]]), "fill-antialias": false },
    },
    {
      id: "park",
      type: "fill",
      source: src,
      "source-layer": "park",
      minzoom: 8,
      filter: isPolygon as FilterSpecification,
      paint: { "fill-color": p.green, "fill-opacity": linear([[8, 0], [10, 0.6], [15, 0.8]]), "fill-antialias": false },
    },
    {
      id: "landuse-residential",
      type: "fill",
      source: src,
      "source-layer": "landuse",
      minzoom: 10,
      filter: ["all", isPolygon, classIn("residential", "suburb", "neighbourhood")] as FilterSpecification,
      paint: { "fill-color": p.residential, "fill-opacity": linear([[10, 0], [12, 0.7]]), "fill-antialias": false },
    },
    {
      id: "water",
      type: "fill",
      source: src,
      "source-layer": "water",
      filter: ["all", isPolygon, notTunnel] as FilterSpecification,
      paint: { "fill-color": p.water },
    },
    {
      id: "waterway",
      type: "line",
      source: src,
      "source-layer": "waterway",
      minzoom: 8,
      filter: ["all", isLine, notTunnel] as FilterSpecification,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": p.waterLine, "line-width": ramp([[8, 0.5], [12, 1], [16, 3], [18, 6]], 1.4) },
    },
    {
      id: "building",
      type: "fill",
      source: src,
      "source-layer": "building",
      minzoom: 14,
      paint: { "fill-color": p.building, "fill-outline-color": p.buildingLine, "fill-opacity": linear([[14, 0], [15, 1]]) },
    },
    {
      id: "boundary-state",
      type: "line",
      source: src,
      "source-layer": "boundary",
      minzoom: 4,
      filter: ["all", [">=", ["get", "admin_level"], 3], ["<=", ["get", "admin_level"], 4], ["!=", ["get", "maritime"], 1]] as FilterSpecification,
      layout: { "line-join": "round" },
      paint: { "line-color": p.boundaryState, "line-width": ramp([[4, 0.4], [10, 1], [16, 1.6]], 1.3), "line-dasharray": [2, 2] },
    },
    {
      id: "boundary-country",
      type: "line",
      source: src,
      "source-layer": "boundary",
      filter: ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1], ["!=", ["coalesce", ["get", "disputed"], 0], 1]] as FilterSpecification,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": p.boundary, "line-width": ramp([[0, 0.4], [4, 0.7], [10, 1.4], [16, 2.2]], 1.3) },
    },
    // Casings first, then fills, so junctions merge cleanly.
    roads("road-minor-casing", MINOR, 13, p.roadCasing, ramp([[13, 1.4], [14, 3.2], [16, 7.6], [18, 16]])),
    roads("road-major-casing", MAJOR, 10, p.roadCasing, ramp([[10, 1.4], [12, 2.8], [14, 5.6], [16, 11], [18, 23]]), linear([[10, 0], [11, 1]])),
    roads("road-highway-casing", HIGHWAY, 7, p.highwayCasing, ramp([[7, 1.4], [10, 3], [12, 4.6], [14, 8], [16, 15], [18, 30]]), linear([[7, 0], [8, 1]])),
    roads("road-minor", MINOR, 12, p.road, ramp([[12, 0.5], [14, 2], [16, 6], [18, 14]])),
    roads("road-major", MAJOR, 8, p.road, ramp([[8, 0.4], [10, 0.9], [12, 1.8], [14, 4], [16, 9], [18, 20]])),
    roads("road-highway", HIGHWAY, 5, p.highway, ramp([[5, 0.5], [8, 1.1], [10, 1.9], [12, 3.2], [14, 6], [16, 12], [18, 26]])),
  ];
}

function labelLayers(p: MapPalette): LayerSpecification[] {
  const src = SRC.basemap;
  const halo = { "text-halo-color": p.halo, "text-halo-width": 1.3, "text-halo-blur": 0.4 };
  const rank: ExpressionSpecification = ["coalesce", ["get", "rank"], 10];
  return [
    {
      id: "label-water",
      type: "symbol",
      source: src,
      "source-layer": "water_name",
      maxzoom: 14,
      // Oceans from the start, seas once you're closer, lakes at regional zoom.
      filter: ["step", zoom, ["all", isPoint, classIn("ocean")], 3.5, ["all", isPoint, classIn("ocean", "sea", "bay")], 8, ["all", isPoint, classIn("ocean", "sea", "bay", "lake")]] as FilterSpecification,
      layout: {
        "text-field": name,
        "text-font": FONT.italic,
        "text-size": linear([[1, 11], [6, 13], [12, 14]]),
        "text-letter-spacing": 0.08,
        "text-max-width": 8,
      },
      paint: { "text-color": p.waterLabel, "text-halo-color": alpha(p.water, 0.7), "text-halo-width": 1 },
    },
    {
      id: "label-road",
      type: "symbol",
      source: src,
      "source-layer": "transportation_name",
      minzoom: 13,
      filter: ["all", isLine, classIn("motorway", "trunk", "primary", "secondary", "tertiary", "minor")] as FilterSpecification,
      layout: {
        "symbol-placement": "line",
        "text-field": name,
        "text-font": FONT.regular,
        "text-size": linear([[13, 10], [16, 12.5], [18, 14]]),
        "text-rotation-alignment": "map",
        "text-pitch-alignment": "viewport",
      },
      paint: { "text-color": p.labelRoad, "text-halo-color": p.roadHalo, "text-halo-width": 1.5 },
    },
    {
      id: "label-neighbourhood",
      type: "symbol",
      source: src,
      "source-layer": "place",
      minzoom: 12,
      maxzoom: 17,
      filter: classIn("suburb", "quarter", "neighbourhood") as FilterSpecification,
      layout: {
        "text-field": name,
        "text-font": FONT.regular,
        "text-size": linear([[12, 10], [16, 12]]),
        "text-transform": "uppercase",
        "text-letter-spacing": 0.12,
        "text-max-width": 7,
      },
      paint: { "text-color": p.labelMinor, ...halo },
    },
    {
      id: "label-village",
      type: "symbol",
      source: src,
      "source-layer": "place",
      minzoom: 10,
      maxzoom: 16,
      filter: classIn("village", "hamlet") as FilterSpecification,
      layout: { "text-field": name, "text-font": FONT.regular, "text-size": linear([[10, 10.5], [14, 13]]), "text-max-width": 8 },
      paint: { "text-color": p.labelTown, ...halo },
    },
    {
      id: "label-town",
      type: "symbol",
      source: src,
      "source-layer": "place",
      minzoom: 7,
      maxzoom: 16,
      filter: classIn("town") as FilterSpecification,
      layout: { "text-field": name, "text-font": FONT.regular, "text-size": linear([[7, 10.5], [10, 12], [14, 15]]), "text-max-width": 8 },
      paint: { "text-color": p.labelTown, ...halo },
    },
    {
      id: "label-city",
      type: "symbol",
      source: src,
      "source-layer": "place",
      minzoom: 3,
      maxzoom: 15,
      // Only the big names until you zoom in (calm planet view).
      filter: ["step", zoom, ["all", classIn("city"), ["<=", rank, 2]], 4.5, ["all", classIn("city"), ["<=", rank, 4]], 6, classIn("city")] as FilterSpecification,
      layout: {
        "text-field": name,
        "text-font": FONT.regular,
        "symbol-sort-key": rank,
        "text-size": linear([
          [3, ["step", rank, 12, 3, 11, 5, 10]],
          [8, ["step", rank, 16, 3, 14.5, 5, 13]],
          [12, ["step", rank, 19, 3, 17.5, 5, 16]],
        ]),
        "text-max-width": 8,
      },
      paint: { "text-color": p.labelCity, ...halo },
    },
    {
      id: "label-country",
      type: "symbol",
      source: src,
      "source-layer": "place",
      minzoom: 1,
      maxzoom: 7,
      filter: ["step", zoom, ["all", classIn("country"), ["<=", rank, 2]], 2.4, ["all", classIn("country"), ["<=", rank, 4]], 3.6, classIn("country")] as FilterSpecification,
      layout: {
        "text-field": name,
        "text-font": FONT.regular,
        "symbol-sort-key": rank,
        "text-size": linear([
          [1, ["step", rank, 11, 3, 10, 5, 9]],
          [4, ["step", rank, 13.5, 3, 12, 5, 11]],
          [7, ["step", rank, 16, 3, 14, 5, 13]],
        ]),
        "text-transform": "uppercase",
        "text-letter-spacing": 0.14,
        "text-max-width": 6.5,
        "text-padding": 6,
      },
      paint: { "text-color": p.labelCountry, ...halo },
    },
  ];
}

/** People overlay: arcs under the labels, clusters / dots / home above everything. */
function overlayLayers(p: MapPalette): { below: LayerSpecification[]; above: LayerSpecification[] } {
  const people: ExpressionSpecification = ["get", "people"];
  const isCluster: FilterSpecification = ["has", "point_count"];
  const below: LayerSpecification[] = [
    {
      id: LAYER.arcs,
      type: "line",
      source: SRC.arcs,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-width": linear([[1, 1.4], [6, 2.2], [12, 3]]),
        "line-gradient": ["interpolate", ["linear"], ["line-progress"], 0, alpha(p.accentStrong, 0.85), 1, alpha(p.accent, 0.35)],
      },
    },
  ];
  const above: LayerSpecification[] = [
    {
      id: LAYER.homeHalo,
      type: "circle",
      source: SRC.home,
      paint: { "circle-radius": linear([[1, 9], [10, 14]]), "circle-color": alpha(p.accentStrong, 0.18), "circle-blur": 0.3 },
    },
    {
      id: LAYER.home,
      type: "circle",
      source: SRC.home,
      paint: { "circle-radius": linear([[1, 4], [10, 5.5]]), "circle-color": p.accentStrong, "circle-stroke-color": p.ring, "circle-stroke-width": 2 },
    },
    {
      id: LAYER.clusterHalo,
      type: "circle",
      source: SRC.cities,
      filter: isCluster,
      paint: {
        "circle-radius": ["interpolate", ["linear"], people, 2, 23, 20, 28, 100, 35, 500, 43],
        "circle-color": p.clusterHalo,
        "circle-blur": 0.25,
      },
    },
    {
      id: LAYER.cluster,
      type: "circle",
      source: SRC.cities,
      filter: isCluster,
      paint: {
        "circle-radius": ["interpolate", ["linear"], people, 2, 15, 20, 18.5, 100, 23, 500, 29],
        "circle-color": p.accentFill,
        "circle-stroke-color": p.ring,
        "circle-stroke-width": 2.5,
      },
    },
    {
      id: LAYER.clusterCount,
      type: "symbol",
      source: SRC.cities,
      filter: isCluster,
      layout: {
        "text-field": ["to-string", people],
        "text-font": FONT.bold,
        "text-size": ["interpolate", ["linear"], people, 2, 12.5, 100, 14, 500, 15],
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: { "text-color": p.onAccent },
    },
    {
      id: LAYER.cityDot,
      type: "circle",
      source: SRC.cities,
      filter: ["!", isCluster] as FilterSpecification,
      paint: {
        "circle-radius": linear([[1, 4.5], [10, 5.5]]),
        "circle-color": ["case", ["boolean", ["get", "hasInner"], false], p.inner, p.accentFill],
        "circle-stroke-color": p.ring,
        "circle-stroke-width": 2,
      },
    },
  ];
  return { below, above };
}

function overlaySources(): Record<string, SourceSpecification> {
  return {
    [SRC.cities]: {
      type: "geojson",
      data: EMPTY_FC,
      cluster: true,
      clusterRadius: CLUSTER.radius,
      clusterMaxZoom: CLUSTER.maxZoom,
      clusterProperties: { people: ["+", ["get", "count"]] },
    },
    [SRC.arcs]: { type: "geojson", data: EMPTY_FC, lineMetrics: true },
    [SRC.home]: { type: "geojson", data: EMPTY_FC },
  };
}

function sky(mode: MapMode, p: MapPalette): SkySpecification {
  const dark = mode === "dark";
  return {
    "sky-color": p.sky,
    "horizon-color": p.horizon,
    "fog-color": p.fog,
    "sky-horizon-blend": 0.6,
    "horizon-fog-blend": 0.5,
    "fog-ground-blend": 0.6,
    // Glow around the planet that fades as the camera comes down to street level.
    "atmosphere-blend": linear(dark ? [[0, 0.9], [4, 0.7], [7, 0]] : [[0, 0.55], [4, 0.4], [7, 0]]),
  };
}

export type BuildStyleOptions = { mode: MapMode; tokens: MapTokens };

export function buildStyle({ mode, tokens }: BuildStyleOptions): StyleSpecification {
  const p = mapPalette(mode, tokens);
  const overlay = overlayLayers(p);
  const base = basemapLayers(p);
  const labels = labelLayers(p);
  return {
    version: 8,
    name: `The Network · ${mode}`,
    glyphs: OFM_GLYPHS,
    projection: { type: "globe" },
    sky: sky(mode, p),
    light: { anchor: "viewport", position: [1.2, 200, 35], color: tokens["--surface-solid"], intensity: 0.4 },
    sources: {
      [SRC.basemap]: { type: "vector", url: OFM_TILEJSON },
      ...overlaySources(),
    },
    layers: [...base, ...overlay.below, ...labels, ...overlay.above],
  };
}
