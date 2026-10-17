/**
 * Pure data shaping for the globe: people → one feature per home city, home → city arcs,
 * camera helpers. No DOM, no MapLibre runtime — unit tested in `globe-data.test.ts`.
 */
import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import type { Warmth } from "@/lib/constants";
import type { IndexLocation } from "@/lib/queries/types";
import { initials } from "@/lib/utils";

/** The fields of a people-index row the globe reads (dates may be ISO strings after JSON). */
export type GlobePerson = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  headline: string | null;
  company: string | null;
  warmth: Warmth;
  homeLocation: IndexLocation | null;
  activityIds: string[];
  lastInteractionAt: string | Date | null;
};

export type AvatarRef = { id: string; name: string; url: string | null; initials: string };

/** Everyone who lives in one city, most important first. */
export type CityGroup<P extends GlobePerson = GlobePerson> = {
  location: IndexLocation;
  people: P[];
  avatars: AvatarRef[];
  hasInner: boolean;
};

/**
 * Feature properties. `avatars` is informational: MapLibre stringifies nested values when it
 * tiles GeoJSON, so the pin layer reads avatars from the `CityGroup` map instead.
 */
export type CityProps = {
  locationId: string;
  name: string;
  count: number;
  avatars: AvatarRef[];
  hasInner: boolean;
};

export type CityCollection = FeatureCollection<Point, CityProps>;
export type ArcCollection = FeatureCollection<LineString, { locationId: string; count: number }>;
export type LngLatPair = [number, number];

export const AVATARS_PER_CITY = 3;

const WARMTH_RANK: Record<Warmth, number> = { inner: 0, active: 1, dormant: 2, archive: 3 };

const time = (d: string | Date | null) => (d ? new Date(d).getTime() || 0 : 0);

/** Closest first: warmth, then most recent interaction, then name. */
export function comparePeople(a: GlobePerson, b: GlobePerson): number {
  return (
    WARMTH_RANK[a.warmth] - WARMTH_RANK[b.warmth] ||
    time(b.lastInteractionAt) - time(a.lastInteractionAt) ||
    a.displayName.localeCompare(b.displayName)
  );
}

export function avatarRef(p: Pick<GlobePerson, "id" | "displayName" | "avatarUrl">): AvatarRef {
  return { id: p.id, name: p.displayName, url: p.avatarUrl, initials: initials(p.displayName) };
}

export type CityData<P extends GlobePerson = GlobePerson> = {
  collection: CityCollection;
  groups: Map<string, CityGroup<P>>;
  /** People without a home city (not on the map). */
  withoutCity: number;
};

/** Groups people by `homeLocation.id` into a point FeatureCollection (biggest cities first). */
export function buildCityData<P extends GlobePerson>(people: readonly P[]): CityData<P> {
  const byId = new Map<string, { location: IndexLocation; people: P[] }>();
  let withoutCity = 0;
  for (const p of people) {
    const loc = p.homeLocation;
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) {
      withoutCity++;
      continue;
    }
    const g = byId.get(loc.id);
    if (g) g.people.push(p);
    else byId.set(loc.id, { location: loc, people: [p] });
  }

  const groups = new Map<string, CityGroup<P>>();
  const ordered = [...byId.values()].sort((a, b) => b.people.length - a.people.length || a.location.name.localeCompare(b.location.name));
  const features: Feature<Point, CityProps>[] = [];
  for (const { location, people: list } of ordered) {
    list.sort(comparePeople);
    const avatars = list.slice(0, AVATARS_PER_CITY).map(avatarRef);
    const hasInner = list.some((p) => p.warmth === "inner");
    groups.set(location.id, { location, people: list, avatars, hasInner });
    features.push({
      type: "Feature",
      id: features.length,
      geometry: { type: "Point", coordinates: [location.lng, location.lat] },
      properties: { locationId: location.id, name: location.name, count: list.length, avatars, hasInner },
    });
  }
  return { collection: { type: "FeatureCollection", features }, groups, withoutCity };
}

/* ---------- great circles ---------- */

const RAD = Math.PI / 180;

type Vec3 = [number, number, number];
const toVec = ([lng, lat]: LngLatPair): Vec3 => [Math.cos(lat * RAD) * Math.cos(lng * RAD), Math.cos(lat * RAD) * Math.sin(lng * RAD), Math.sin(lat * RAD)];
const toLngLat = ([x, y, z]: Vec3): LngLatPair => [Math.atan2(y, x) / RAD, Math.atan2(z, Math.hypot(x, y)) / RAD];

/** Central angle between two points, in radians. */
export function angularDistance(a: LngLatPair, b: LngLatPair): number {
  const [ax, ay, az] = toVec(a);
  const [bx, by, bz] = toVec(b);
  const cross = Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
  return Math.atan2(cross, ax * bx + ay * by + az * bz);
}

/**
 * Points along the great circle from `a` to `b` (inclusive). Longitudes are unwrapped so the
 * line never jumps across the antimeridian (MapLibre draws lng > 180 correctly).
 */
export function greatCircle(a: LngLatPair, b: LngLatPair, segments?: number): LngLatPair[] {
  const d = angularDistance(a, b);
  if (d < 1e-9) return [a, b];
  const n = Math.max(2, segments ?? Math.ceil((d / RAD) * 1.2) + 8);
  const va = toVec(a);
  const vb = toVec(b);
  const sinD = Math.sin(d);
  const out: LngLatPair[] = [];
  let prevLng = a[0];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const k1 = Math.sin((1 - t) * d) / sinD;
    const k2 = Math.sin(t * d) / sinD;
    const [lng0, lat] = toLngLat([k1 * va[0] + k2 * vb[0], k1 * va[1] + k2 * vb[1], k1 * va[2] + k2 * vb[2]]);
    let lng = lng0;
    while (lng - prevLng > 180) lng -= 360;
    while (lng - prevLng < -180) lng += 360;
    prevLng = lng;
    out.push([lng, lat]);
  }
  return out;
}

/** ~3 km: a city this close to home gets no arc. */
const MIN_ARC = 3 / 6371;

/** Great-circle arcs from home to every city (skipping home's own city). */
export function buildArcCollection(home: { lat: number; lng: number }, cities: Iterable<CityGroup>): ArcCollection {
  const from: LngLatPair = [home.lng, home.lat];
  const features: ArcCollection["features"] = [];
  for (const c of cities) {
    const to: LngLatPair = [c.location.lng, c.location.lat];
    if (angularDistance(from, to) < MIN_ARC) continue;
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: greatCircle(from, to) },
      properties: { locationId: c.location.id, count: c.people.length },
    });
  }
  return { type: "FeatureCollection", features };
}

/* ---------- camera helpers ---------- */

/** Weighted spherical centroid of the cities (by head count); null when there are none. */
export function peopleCentroid(cities: Iterable<CityGroup>): LngLatPair | null {
  let x = 0, y = 0, z = 0, n = 0;
  for (const c of cities) {
    const w = c.people.length;
    const [vx, vy, vz] = toVec([c.location.lng, c.location.lat]);
    x += vx * w;
    y += vy * w;
    z += vz * w;
    n += w;
  }
  if (n === 0 || Math.hypot(x, y, z) < 1e-9) return null;
  return toLngLat([x, y, z]);
}

/** [[west, south], [east, north]] around the cities, or null. Picks the narrower of the two ways around the antimeridian. */
export function citiesBounds(cities: Iterable<CityGroup>): [LngLatPair, LngLatPair] | null {
  const pts = [...cities].map((c) => [c.location.lng, c.location.lat] as LngLatPair);
  if (!pts.length) return null;
  const lats = pts.map((p) => p[1]);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  const lngs = pts.map((p) => p[0]);
  const west = Math.min(...lngs);
  const east = Math.max(...lngs);
  // Same set shifted into 0…360: narrower when the points straddle the antimeridian.
  const shifted = lngs.map((l) => (l < 0 ? l + 360 : l));
  const sw = Math.min(...shifted);
  const se = Math.max(...shifted);
  return se - sw < east - west ? [[sw, south], [se, north]] : [[west, south], [east, north]];
}

/** MapLibre's default vertical field of view (36.87°) puts the camera 1.5 viewport-heights from the centre. */
const CAMERA_DISTANCE_PER_HEIGHT = 0.5 / Math.tan((36.87 / 2) * RAD);

/**
 * Zoom at which the planet's silhouette fills ~`fill` of the free area's smaller side (default:
 * 94% on portrait phones, 82% otherwise). Accounts for MapLibre's globe maths:
 * - radius R = worldSize / (2π·cos(lat)), worldSize = 512·2^z (feature scale at the centre
 *   latitude matches Mercator, so the planet grows away from the equator);
 * - perspective: seen from distance D (= 1.5 × container height), the silhouette radius on
 *   screen is D·R / √(D² + 2·D·R), which we invert for R.
 */
export function planetZoom(width: number, height: number, opts: { lat?: number; fill?: number; containerHeight?: number } = {}): number {
  const side = Math.max(1, Math.min(width, height));
  // Portrait phones are width-bound: let the planet nearly reach the edges.
  const fill = opts.fill ?? (width < height * 0.7 ? 0.94 : 0.82);
  const d = CAMERA_DISTANCE_PER_HEIGHT * Math.max(1, opts.containerHeight ?? height);
  const k = (side * fill) / 2 / d;
  const radius = d * (k * k + k * Math.sqrt(k * k + 1));
  const cosLat = Math.cos(Math.min(Math.abs(opts.lat ?? 0), 85) * RAD);
  return Math.min(2.6, Math.max(0, Math.log2((2 * Math.PI * cosLat * radius) / 512)));
}
