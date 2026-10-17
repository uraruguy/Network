import { describe, expect, it } from "vitest";
import {
  angularDistance,
  buildArcCollection,
  buildCityData,
  citiesBounds,
  greatCircle,
  peopleCentroid,
  planetZoom,
  type GlobePerson,
  type LngLatPair,
} from "./globe-data";

const loc = (id: string, name: string, lat: number, lng: number) => ({ id, name, country: "X", countryCode: "XX", lat, lng, timezone: null });
const LJ = loc("lj", "Ljubljana", 46.05, 14.51);
const LDN = loc("ldn", "London", 51.51, -0.13);
const SF = loc("sf", "San Francisco", 37.77, -122.42);
const TOKYO = loc("tyo", "Tokyo", 35.68, 139.69);

let n = 0;
function person(over: Partial<GlobePerson> & { displayName: string }): GlobePerson {
  return {
    id: `p${n++}`,
    avatarUrl: null,
    headline: null,
    company: null,
    warmth: "active",
    homeLocation: null,
    activityIds: [],
    lastInteractionAt: null,
    ...over,
  };
}

describe("buildCityData", () => {
  const people = [
    person({ displayName: "Ana Novak", homeLocation: LJ, warmth: "dormant" }),
    person({ displayName: "Bor Kos", homeLocation: LJ, warmth: "inner" }),
    person({ displayName: "Cene Zupan", homeLocation: LJ, lastInteractionAt: "2026-01-01T00:00:00Z" }),
    person({ displayName: "Dana Horvat", homeLocation: LJ, lastInteractionAt: "2026-06-01T00:00:00Z", avatarUrl: "https://x/d.jpg" }),
    person({ displayName: "Eve Smith", homeLocation: LDN }),
    person({ displayName: "No City" }),
    person({ displayName: "Broken", homeLocation: { ...SF, lat: Number.NaN } }),
  ];
  const { collection, groups, withoutCity } = buildCityData(people);

  it("groups people by home city, biggest first", () => {
    expect(collection.features.map((f) => f.properties.locationId)).toEqual(["lj", "ldn"]);
    expect(collection.features[0]!.properties.count).toBe(4);
    expect(collection.features[0]!.geometry.coordinates).toEqual([14.51, 46.05]);
    expect(groups.get("lj")!.people).toHaveLength(4);
  });

  it("counts people without a usable city", () => {
    expect(withoutCity).toBe(2);
  });

  it("orders by warmth, then recency, then name; keeps the top 3 avatars", () => {
    const g = groups.get("lj")!;
    expect(g.people.map((p) => p.displayName)).toEqual(["Bor Kos", "Dana Horvat", "Cene Zupan", "Ana Novak"]);
    expect(g.avatars).toEqual([
      { id: g.people[0]!.id, name: "Bor Kos", url: null, initials: "BK" },
      { id: g.people[1]!.id, name: "Dana Horvat", url: "https://x/d.jpg", initials: "DH" },
      { id: g.people[2]!.id, name: "Cene Zupan", url: null, initials: "CZ" },
    ]);
    expect(collection.features[0]!.properties.avatars).toHaveLength(3);
  });

  it("flags cities with an inner-circle person", () => {
    expect(groups.get("lj")!.hasInner).toBe(true);
    expect(collection.features[1]!.properties.hasInner).toBe(false);
  });

  it("gives every feature a numeric id (feature-state friendly)", () => {
    expect(collection.features.map((f) => f.id)).toEqual([0, 1]);
  });

  it("is empty for no people", () => {
    const empty = buildCityData([]);
    expect(empty.collection.features).toEqual([]);
    expect(empty.withoutCity).toBe(0);
  });
});

describe("great circles", () => {
  it("measures central angles", () => {
    expect(angularDistance([0, 0], [90, 0])).toBeCloseTo(Math.PI / 2, 6);
    expect(angularDistance([0, 90], [123, -90])).toBeCloseTo(Math.PI, 6);
    expect(angularDistance([14.5, 46], [14.5, 46])).toBe(0);
  });

  it("starts and ends at the endpoints and bends poleward", () => {
    const a: LngLatPair = [-0.13, 51.51];
    const b: LngLatPair = [-122.42, 37.77];
    const line = greatCircle(a, b, 32);
    expect(line).toHaveLength(33);
    expect(line[0]![0]).toBeCloseTo(a[0], 6);
    expect(line[0]![1]).toBeCloseTo(a[1], 6);
    expect(line.at(-1)![0]).toBeCloseTo(b[0], 6);
    expect(line.at(-1)![1]).toBeCloseTo(b[1], 6);
    // London → SF passes over Greenland/Canada, well north of both cities.
    expect(Math.max(...line.map((p) => p[1]))).toBeGreaterThan(60);
  });

  it("unwraps longitudes across the antimeridian", () => {
    const line = greatCircle([139.69, 35.68], [-122.42, 37.77]);
    for (let i = 1; i < line.length; i++) expect(Math.abs(line[i]![0] - line[i - 1]![0])).toBeLessThan(180);
    expect(line.at(-1)![0]).toBeCloseTo(-122.42 + 360, 6);
  });
});

describe("buildArcCollection", () => {
  const { groups } = buildCityData([
    person({ displayName: "A", homeLocation: LJ }),
    person({ displayName: "B", homeLocation: LDN }),
    person({ displayName: "C", homeLocation: LDN }),
    person({ displayName: "D", homeLocation: TOKYO }),
  ]);

  it("draws one arc per city except home's own", () => {
    const arcs = buildArcCollection({ lat: 46.051, lng: 14.505 }, groups.values());
    expect(arcs.features.map((f) => f.properties.locationId).sort()).toEqual(["ldn", "tyo"]);
    const ldn = arcs.features.find((f) => f.properties.locationId === "ldn")!;
    expect(ldn.properties.count).toBe(2);
    expect(ldn.geometry.coordinates[0]).toEqual([14.505, 46.051]);
    expect(ldn.geometry.coordinates.length).toBeGreaterThan(8);
  });
});

describe("camera helpers", () => {
  const { groups } = buildCityData([person({ displayName: "A", homeLocation: LJ }), person({ displayName: "B", homeLocation: LDN })]);

  it("centroid sits between the cities", () => {
    const [lng, lat] = peopleCentroid(groups.values())!;
    expect(lng).toBeGreaterThan(-0.13);
    expect(lng).toBeLessThan(14.51);
    expect(lat).toBeGreaterThan(46);
    expect(lat).toBeLessThan(52);
    expect(peopleCentroid([])).toBeNull();
  });

  it("bounds wrap the narrow way around the antimeridian", () => {
    expect(citiesBounds(groups.values())).toEqual([[-0.13, 46.05], [14.51, 51.51]]);
    const pacific = buildCityData([person({ displayName: "T", homeLocation: TOKYO }), person({ displayName: "S", homeLocation: SF })]);
    const [[w], [e]] = citiesBounds(pacific.groups.values())!;
    expect(w).toBeCloseTo(139.69);
    expect(e).toBeCloseTo(-122.42 + 360);
    expect(citiesBounds([])).toBeNull();
  });

  it("planet zoom grows with the viewport and stays in range", () => {
    expect(planetZoom(375, 700)).toBeLessThan(planetZoom(1400, 900));
    expect(planetZoom(10, 10)).toBe(0);
    expect(planetZoom(10000, 10000)).toBeLessThanOrEqual(2.6);
    // Same planet size further north needs a lower zoom (MapLibre scales the globe by 1/cos(lat)).
    expect(planetZoom(1200, 900, { lat: 60 })).toBeCloseTo(planetZoom(1200, 900) - 1, 6);
    // Inverse of MapLibre's perspective: the silhouette radius D·R/√(D²+2DR) comes back as asked.
    const z = planetZoom(343, 604, { containerHeight: 812, fill: 0.94 });
    const R = (512 * 2 ** z) / (2 * Math.PI);
    const D = 1.5 * 812;
    expect((2 * D * R) / Math.sqrt(D * D + 2 * D * R)).toBeCloseTo(343 * 0.94, 0);
  });
});
