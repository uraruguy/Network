/**
 * City resolution for imported profiles: aliases + Slovenian locatives in front of the
 * `search_cities` lookup, with a per-run cache.
 */
import { deaccent } from "./names";

export type CityHit = {
  id: number;
  name: string;
  admin: string | null;
  country: string;
  countryCode: string;
  lat: number;
  lng: number;
  timezone: string | null;
};

const CITY_ALIASES: Record<string, string> = {
  sf: "San Francisco",
  "san fran": "San Francisco",
  "san francisku": "San Francisco",
  "bay area": "San Francisco",
  lj: "Ljubljana",
  ljubljani: "Ljubljana",
  ljubljane: "Ljubljana",
  ljublana: "Ljubljana",
  nyc: "New York",
  ny: "New York",
  "new york city": "New York",
  "new yorku": "New York",
  la: "Los Angeles",
  berlinu: "Berlin",
  munchen: "Munich",
  münchen: "Munich",
  munchnu: "Munich",
  münchnu: "Munich",
  dunaj: "Vienna",
  dunaju: "Vienna",
  wien: "Vienna",
  benetke: "Venice",
  benetkah: "Venice",
  rim: "Rome",
  rimu: "Rome",
  pariz: "Paris",
  parizu: "Paris",
  londonu: "London",
  zagrebu: "Zagreb",
  mariboru: "Maribor",
  kranju: "Kranj",
  celju: "Celje",
  kopru: "Koper",
  hamburgu: "Hamburg",
  milanu: "Milan",
  amsterdamu: "Amsterdam",
  ženeva: "Geneva",
  zenevi: "Geneva",
  ženevi: "Geneva",
  "palo altu": "Palo Alto",
  bledu: "Bled",
  tržiču: "Tržič",
  trzicu: "Tržič",
  radovljici: "Radovljica",
  "škofji loki": "Škofja Loka",
  "skofji loki": "Škofja Loka",
};

const COUNTRY_ALIASES: Record<string, string> = {
  usa: "united states",
  us: "united states",
  zda: "united states",
  amerika: "united states",
  america: "united states",
  "united states of america": "united states",
  slovenija: "slovenia",
  si: "slovenia",
  nemcija: "germany",
  deutschland: "germany",
  de: "germany",
  avstrija: "austria",
  hrvaska: "croatia",
  italija: "italy",
  francija: "france",
  anglija: "united kingdom",
  uk: "united kingdom",
  england: "united kingdom",
  svica: "switzerland",
  nizozemska: "netherlands",
  spanija: "spain",
  finska: "finland",
  norveska: "norway",
  svedska: "sweden",
};

const fold = (s: string) => deaccent(s).toLowerCase().trim().replace(/\s+/g, " ");

export function normCountry(c: string | null | undefined) {
  if (!c) return null;
  const f = fold(c);
  return COUNTRY_ALIASES[f] ?? f;
}

/** Query strings to try for a raw city mention, best first. */
export function cityQueries(raw: string): string[] {
  const cleaned = raw.replace(/\(.*?\)/g, "").split(/[,/;]| - /)[0]!.trim();
  if (!cleaned) return [];
  const out: string[] = [];
  const alias = CITY_ALIASES[cleaned.toLowerCase()] ?? CITY_ALIASES[fold(cleaned)];
  if (alias) out.push(alias);
  out.push(cleaned);
  // Slovenian locative: v Berlinu → Berlin, v Ljubljani → Ljubljana.
  if (/[^aeiou]u$/i.test(cleaned)) out.push(cleaned.slice(0, -1));
  if (/i$/i.test(cleaned)) out.push(`${cleaned.slice(0, -1)}a`);
  return [...new Set(out)];
}

export type Geocoder = (city: string | null | undefined, country?: string | null) => Promise<CityHit | null>;

/** Wraps a `search_cities` lookup with aliases, locatives, country preference and a cache. */
export function createGeocoder(search: (q: string, limit: number) => Promise<CityHit[]>): Geocoder & { cache: Map<string, CityHit | null> } {
  const cache = new Map<string, CityHit | null>();
  const fn = async (city: string | null | undefined, country?: string | null) => {
    if (!city || !city.trim()) return null;
    const ck = `${fold(city)}|${normCountry(country) ?? ""}`;
    if (cache.has(ck)) return cache.get(ck)!;
    let found: CityHit | null = null;
    const wantCountry = normCountry(country);
    for (const q of cityQueries(city)) {
      const hits = await search(q, 8);
      if (!hits.length) continue;
      const exact = hits.filter((h) => fold(h.name) === fold(q));
      const pool = exact.length ? exact : hits;
      found = (wantCountry && pool.find((h) => normCountry(h.country) === wantCountry)) || pool[0]!;
      break;
    }
    cache.set(ck, found);
    return found;
  };
  return Object.assign(fn, { cache });
}
