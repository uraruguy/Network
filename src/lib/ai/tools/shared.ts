import "server-only";
import { dateTimeFormat } from "@/lib/format";
import { getPerson, searchPeople, type IndexLocation, type PersonIndexRow } from "@/lib/data/people";
import { listTaxonomy } from "@/lib/data/tags";
import { normalizeForSearch } from "@/components/ui/search";
import { nameKey } from "@/lib/text";
import { ToolError, type ToolCtx } from "./registry";

/**
 * Helpers shared by the operations: taxonomy lookups (names ⇄ ids), person resolution by id or
 * name, and the compact shapes results are rendered in. Results stay small on purpose — the
 * model reads every byte, and MCP clients pay for it in context.
 */

/** Characters of note text in excerpts. */
export const EXCERPT = 280;

/* ------------------------------------------------------------------ */
/*  Text & dates                                                        */
/* ------------------------------------------------------------------ */

/** Collapses whitespace and cuts at `max` characters (word boundary when close), adding "…". */
export function clip(text: string | null | undefined, max = EXCERPT): string {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.7 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** Calendar date (YYYY-MM-DD) in the owner's zone. */
export function day(value: Date | string | null | undefined, timezone: string): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return dateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: timezone }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** Drops null, undefined, "" and empty arrays so results carry only what's known. */
export function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

export const place = (l: Pick<IndexLocation, "name" | "country"> | null | undefined) => (l ? `${l.name}, ${l.country}` : null);

/** Parses a loose date ("2026-10-01", ISO date-time). Throws a ToolError naming the field. */
export function parseDate(value: string | undefined, field: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(d.getTime())) throw new ToolError("invalid_input", `${field} must be a date like 2026-10-01`);
  return d;
}

/* ------------------------------------------------------------------ */
/*  Taxonomy                                                            */
/* ------------------------------------------------------------------ */

export type Names = {
  categories: Map<string, string>;
  activities: Map<string, string>;
  tags: Map<string, string>;
};

const namesCache = new WeakMap<ToolCtx, Promise<Names>>();

/** id → name maps for categories, activities and tags; memoised per tool context (one chat turn). */
export function names(ctx: ToolCtx): Promise<Names> {
  let p = namesCache.get(ctx);
  if (!p) {
    p = listTaxonomy(ctx.ownerId).then((t) => ({
      categories: new Map(t.categories.map((c) => [c.id, c.name])),
      activities: new Map(t.activities.map((a) => [a.id, a.name])),
      tags: new Map(t.tags.map((x) => [x.id, x.name])),
    }));
    p.catch(() => namesCache.delete(ctx));
    namesCache.set(ctx, p);
  }
  return p;
}

/**
 * Resolves names or ids to ids (case-, accent- and emoji-insensitive). Unknown values throw a ToolError
 * listing what exists, so the model can retry with a real value instead of returning nothing.
 */
export function idsFor(values: readonly string[] | undefined, map: Map<string, string>, kind: string): string[] | undefined {
  if (!values?.length) return undefined;
  const byName = new Map([...map].map(([id, name]) => [nameKey(name), id]));
  const ids: string[] = [];
  const unknown: string[] = [];
  for (const v of values) {
    const id = map.has(v) ? v : byName.get(nameKey(v));
    if (id) ids.push(id);
    else unknown.push(v);
  }
  if (unknown.length) {
    const known = [...map.values()].slice(0, 40).join(", ");
    throw new ToolError("invalid_input", `Unknown ${kind}: ${unknown.join(", ")}.`, known ? `Existing ${kind}: ${known}.` : `There are no ${kind} yet.`);
  }
  return [...new Set(ids)];
}

const namesOf = (ids: readonly string[], map: Map<string, string>) => ids.map((id) => map.get(id)).filter((n): n is string => !!n);

/* ------------------------------------------------------------------ */
/*  People                                                              */
/* ------------------------------------------------------------------ */

/** One person as a search result: what's needed to pick and talk about them. */
export function personRow(p: PersonIndexRow, n: Names, timezone: string) {
  return compact({
    id: p.id,
    name: p.displayName,
    headline: p.headline,
    company: p.company,
    city: place(p.homeLocation),
    categories: namesOf(p.categoryIds, n.categories),
    activities: namesOf(p.activityIds, n.activities),
    tags: namesOf(p.tagIds, n.tags),
    warmth: p.warmth,
    circle: p.circle,
    lastContact: day(p.lastInteractionAt, timezone),
    nextFollowUp: day(p.nextFollowupAt, timezone),
  });
}

export type PersonRef = { personId?: string | null; personName?: string | null };

/**
 * Finds exactly one person by id or name. A name matches when it is the person's full name
 * (accent-insensitive) or the only fuzzy hit; otherwise the candidates come back as an
 * "ambiguous" error so the model can ask the user or retry with an id.
 */
export async function resolvePersonId(ctx: ToolCtx, ref: PersonRef): Promise<{ id: string; name: string }> {
  if (ref.personId) {
    const p = await getPerson(ctx.ownerId, ref.personId);
    if (!p) throw new ToolError("not_found", `No person with id ${ref.personId}.`, "Use search_people to find the right id.");
    return { id: p.id, name: p.displayName };
  }
  const name = ref.personName?.trim();
  if (!name) throw new ToolError("invalid_input", "Give personId or personName.");
  const { items } = await searchPeople(ctx.ownerId, { q: name }, { limit: 6 });
  const wanted = normalizeForSearch(name);
  const exact = items.filter((p) => normalizeForSearch(p.displayName) === wanted);
  const pick = exact.length === 1 ? exact[0] : items.length === 1 ? items[0] : null;
  if (pick) return { id: pick.id, name: pick.displayName };
  if (!items.length) throw new ToolError("not_found", `Nobody called “${name}” in the network.`, "Check the spelling, or use search_people with part of the name.");
  throw new ToolError(
    "ambiguous",
    `“${name}” matches several people: ${items.map((p) => `${p.displayName} (${p.id}${p.homeLocation ? `, ${p.homeLocation.name}` : ""})`).join("; ")}.`,
    "Ask the user which one they mean, then call again with personId.",
  );
}
