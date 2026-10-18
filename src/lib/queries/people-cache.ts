/**
 * Pure helpers for optimistic people updates (unit-tested in people-cache.test.ts): seed a full
 * person detail from create input, apply a patch to a cached detail, derive the compact index row.
 * Relations (categories, tags, places, introducer) are resolved from whatever is cached so the
 * profile renders correctly before the server answers — or while offline.
 */
import type { LocationInput, PersonInput, PersonPatch } from "@/lib/schemas";
import type { ActivityRow, Category, IndexLocation, PersonDetailApi, PersonIndexRow, TagRow } from "./types";

export type Lookups = {
  categories?: readonly Category[];
  activities?: readonly Pick<ActivityRow, "id" | "sort" | "name">[];
  tags?: readonly Pick<TagRow, "id" | "name" | "color">[];
  people?: readonly Pick<PersonIndexRow, "id" | "displayName" | "avatarUrl">[];
};

type Location = NonNullable<PersonDetailApi["homeLocation"]>;
type Tag = PersonDetailApi["tags"][number];

/** Placeholder ids for rows the server hasn't created yet. */
export const TEMP_PREFIX = "tmp:";
export const isTempId = (id: string) => id.startsWith(TEMP_PREFIX);

export function locationKey(l: Pick<LocationInput, "cityId" | "name" | "country">): string {
  return l.cityId ? `city:${l.cityId}` : `${l.name}|${l.country}`.toLowerCase();
}

export function toLocation(l: LocationInput, nowIso: string, existing?: Location | null): Location {
  if (existing && locationKey({ cityId: existing.cityId, name: existing.name, country: existing.country }) === locationKey(l)) return existing;
  return {
    id: `${TEMP_PREFIX}${locationKey(l)}`,
    ownerId: "",
    name: l.name,
    admin: l.admin ?? null,
    country: l.country,
    countryCode: l.countryCode ?? null,
    lat: l.lat,
    lng: l.lng,
    timezone: l.timezone ?? null,
    cityId: l.cityId ?? null,
    source: "cities",
    createdAt: nowIso,
    updatedAt: nowIso,
  } as unknown as Location;
}

export function toIndexLocation(l: Location | null | undefined): IndexLocation | null {
  if (!l) return null;
  return { id: l.id, name: l.name, country: l.country, countryCode: l.countryCode, lat: l.lat, lng: l.lng, timezone: l.timezone };
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

function resolveCategories(ids: readonly string[], lookups: Lookups, current: readonly Category[] = []): Category[] {
  const pool = new Map([...current, ...(lookups.categories ?? [])].map((c) => [c.id, c]));
  return ids
    .map((id) => pool.get(id))
    .filter((c): c is Category => !!c)
    .sort((a, b) => a.sort - b.sort || byName(a, b));
}

function sortActivityIds(ids: readonly string[], lookups: Lookups): string[] {
  const order = new Map((lookups.activities ?? []).map((a) => [a.id, a]));
  return [...new Set(ids)].sort((a, b) => {
    const x = order.get(a);
    const y = order.get(b);
    if (!x || !y) return x ? -1 : y ? 1 : 0;
    return x.sort - y.sort || byName(x, y);
  });
}

/** Tag rows for names: existing tags matched case-insensitively, temp rows for new names. */
export function resolveTags(names: readonly string[], lookups: Lookups, current: readonly Tag[] = []): Tag[] {
  const pool = new Map([...(lookups.tags ?? []), ...current].map((t) => [t.name.toLowerCase(), t]));
  const seen = new Set<string>();
  const out: Tag[] = [];
  for (const raw of names) {
    const name = raw.replace(/\s+/g, " ").trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    const hit = pool.get(key);
    out.push(hit ? { id: hit.id, name: hit.name, color: hit.color } : { id: `${TEMP_PREFIX}${key}`, name, color: null });
  }
  return out.sort(byName);
}

function introducer(id: string | null | undefined, lookups: Lookups, current: PersonDetailApi["introducedBy"] | null = null): PersonDetailApi["introducedBy"] {
  if (!id) return null;
  if (current?.id === id) return current;
  const p = lookups.people?.find((x) => x.id === id);
  return p ? { id: p.id, displayName: p.displayName, avatarUrl: p.avatarUrl } : null;
}

const SCALARS = [
  "displayName",
  "firstName",
  "lastName",
  "headline",
  "company",
  "metContext",
  "metAt",
  "warmth",
  "circle",
  "email",
  "phone",
  "linkedin",
  "xHandle",
  "instagram",
  "website",
  "birthday",
  "languages",
  "interests",
  "howICanHelp",
  "whatICanAsk",
  "followupCadenceDays",
  "nextFollowupAt",
] as const;

const blank = (v: unknown) => (typeof v === "string" ? (v.trim() ? v.trim() : null) : v);

/** A cached person detail with `patch` applied (relations resolved from `lookups`). */
export function applyPersonPatch(detail: PersonDetailApi, patch: PersonPatch, lookups: Lookups = {}, now: Date = new Date()): PersonDetailApi {
  const nowIso = now.toISOString();
  const next = { ...detail, updatedAt: nowIso } as Record<string, unknown>;
  for (const k of SCALARS) {
    if (patch[k] === undefined) continue;
    next[k] = k === "displayName" ? String(patch[k]).trim() : (blank(patch[k]) ?? null);
  }
  if (patch.homeLocation !== undefined) {
    const loc = patch.homeLocation ? toLocation(patch.homeLocation, nowIso, detail.homeLocation) : null;
    next.homeLocation = loc;
    next.homeLocationId = loc?.id ?? null;
  }
  if (patch.metLocation !== undefined) {
    const loc = patch.metLocation ? toLocation(patch.metLocation, nowIso, detail.metLocation) : null;
    next.metLocation = loc;
    next.metLocationId = loc?.id ?? null;
  }
  if (patch.introducedById !== undefined) {
    next.introducedById = patch.introducedById === detail.id ? null : (patch.introducedById ?? null);
    next.introducedBy = introducer(next.introducedById as string | null, lookups, detail.introducedBy);
  }
  if (patch.categoryIds) {
    const cats = resolveCategories(patch.categoryIds, lookups, detail.categories);
    next.categories = cats;
    next.categoryIds = cats.map((c) => c.id);
  }
  if (patch.activityIds) next.activityIds = sortActivityIds(patch.activityIds, lookups);
  if (patch.tagNames) {
    const tags = resolveTags(patch.tagNames, lookups, detail.tags);
    next.tags = tags;
    next.tagIds = tags.map((t) => t.id);
  }
  return next as unknown as PersonDetailApi;
}

/** A complete person detail for a person created on this device (shown before the server answers). */
export function seedPersonDetail(input: PersonInput & { id: string }, lookups: Lookups = {}, now: Date = new Date()): PersonDetailApi {
  const nowIso = now.toISOString();
  const base = {
    id: input.id,
    ownerId: "",
    displayName: input.displayName.trim(),
    firstName: null,
    lastName: null,
    avatarUrl: null,
    headline: null,
    company: null,
    homeLocationId: null,
    metContext: null,
    metAt: null,
    metLocationId: null,
    introducedById: null,
    warmth: "active",
    circle: null,
    email: null,
    phone: null,
    linkedin: null,
    xHandle: null,
    instagram: null,
    website: null,
    birthday: null,
    languages: [],
    interests: [],
    howICanHelp: null,
    whatICanAsk: null,
    aiSummary: null,
    aiSummaryAt: null,
    lastInteractionAt: null,
    nextFollowupAt: null,
    followupCadenceDays: null,
    sourceKind: null,
    sourceRef: null,
    createdAt: nowIso,
    updatedAt: nowIso,
    deletedAt: null,
    notesCount: 0,
    homeLocation: null,
    metLocation: null,
    introducedBy: null,
    introduced: [],
    categories: [],
    categoryIds: [],
    activityIds: [],
    tags: [],
    tagIds: [],
    notes: [],
    reminders: [],
    mentions: [],
  } as unknown as PersonDetailApi;
  const { id: _id, hobbies: _h, hobbiesOther: _ho, ...patch } = input;
  return applyPersonPatch(base, patch as PersonPatch, lookups, now);
}

/** The compact index row for a detail. */
export function indexRowFromDetail(p: PersonDetailApi): PersonIndexRow {
  return {
    id: p.id,
    displayName: p.displayName,
    avatarUrl: p.avatarUrl,
    headline: p.headline,
    company: p.company,
    warmth: p.warmth,
    circle: p.circle,
    homeLocation: toIndexLocation(p.homeLocation),
    categoryIds: p.categoryIds,
    activityIds: p.activityIds,
    tagIds: p.tagIds,
    lastInteractionAt: p.lastInteractionAt,
    nextFollowupAt: p.nextFollowupAt,
    createdAt: p.createdAt,
  };
}

/** Index with `row` replacing the same id, or prepended (newest first) when it's new. */
export function upsertIndexRow(rows: readonly PersonIndexRow[], row: PersonIndexRow): PersonIndexRow[] {
  const i = rows.findIndex((r) => r.id === row.id);
  if (i === -1) return [row, ...rows];
  const out = [...rows];
  out[i] = row;
  return out;
}
