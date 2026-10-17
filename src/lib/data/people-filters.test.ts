import { and } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { afterRecencyCursor, decodeCursor, encodeCursor, filtersFromQuery, peopleConditions, peopleFilterQuery } from "./people-filters";

const dialect = new PgDialect();
const OWNER = "114287d9-de5c-4ff5-a9b5-25d0785552e7";
const A = "3ae4df27-f2e0-42ce-a859-92f1dab46b2a";
const B = "59f55dd7-4446-4202-92cc-5a4d98753d2b";
const render = (conds: ReturnType<typeof peopleConditions>) => dialect.sqlToQuery(and(...conds)!);

describe("peopleConditions", () => {
  it("always scopes to the owner and live people", () => {
    const q = render(peopleConditions(OWNER));
    expect(q.sql).toBe('("people"."owner_id" = $1 and "people"."deleted_at" is null)');
    expect(q.params).toEqual([OWNER]);
  });

  it("combines text search: full-text, accent-insensitive substring and trigram similarity", () => {
    const q = render(peopleConditions(OWNER, { q: "Čevap 50%" }));
    expect(q.sql).toContain(`"people"."search" @@ to_tsquery('public.network', $2)`);
    expect(q.sql).toContain(`private.f_unaccent(lower("people"."display_name")) like private.f_unaccent(lower($3))`);
    expect(q.sql).toContain(`private.f_unaccent(lower("people"."display_name")) % private.f_unaccent(lower($4))`);
    expect(q.params.slice(1)).toEqual(["'čevap':* & '50':*", "%Čevap 50\\%%", "Čevap 50%"]);
  });

  it("filters links with ANY semantics, parameterised", () => {
    const q = render(peopleConditions(OWNER, { categoryIds: [A, B], tagIds: [A], activityIds: [B] }));
    expect(q.sql).toContain(`exists (select 1 from "person_categories" where "person_categories"."person_id" = "people"."id" and "person_categories"."category_id" in ($2, $3))`);
    expect(q.sql).toContain(`"person_tags"."tag_id" in ($4)`);
    expect(q.sql).toContain(`"person_activities"."activity_id" in ($5)`);
    expect(q.params).toEqual([OWNER, A, B, A, B]);
  });

  it("filters warmth, circle, country, location and last contact", () => {
    const q = render(
      peopleConditions(OWNER, { warmth: ["inner", "active"], circle: ["potential_close"], countryCode: "si", locationId: A, lastContactBefore: new Date("2026-01-01T00:00:00Z") }),
    );
    expect(q.sql).toContain(`"people"."warmth" in ($2, $3)`);
    expect(q.sql).toContain(`"people"."circle" in ($4)`);
    expect(q.sql).toContain(`upper("locations"."country_code") = $5`);
    expect(q.sql).toContain(`"people"."home_location_id" = $6`);
    expect(q.sql).toContain(`("people"."last_interaction_at" is null or "people"."last_interaction_at" < $7::timestamptz)`);
    expect(q.params).toEqual([OWNER, "inner", "active", "potential_close", "SI", A, "2026-01-01T00:00:00.000Z"]);
  });

  it("ignores empty filters and blank text", () => {
    expect(render(peopleConditions(OWNER, { q: "   ", categoryIds: [], warmth: [] })).params).toEqual([OWNER]);
  });
});

describe("peopleFilterQuery", () => {
  it("accepts comma lists and repeated keys", () => {
    const parsed = peopleFilterQuery.parse({ category: `${A},${B}`, tag: [A], warmth: "inner,dormant", country: "SI" });
    expect(filtersFromQuery(parsed)).toMatchObject({ categoryIds: [A, B], tagIds: [A], warmth: ["inner", "dormant"], countryCode: "SI" });
  });

  it("rejects malformed ids and enum values", () => {
    expect(peopleFilterQuery.safeParse({ category: "nope" }).success).toBe(false);
    expect(peopleFilterQuery.safeParse({ warmth: "hot" }).success).toBe(false);
  });
});

describe("cursors", () => {
  it("round-trip and reject garbage", () => {
    const recent = { k: "recent" as const, t: "2026-10-17 21:44:19.586331+00", id: A };
    expect(decodeCursor(encodeCursor(recent))).toEqual(recent);
    expect(decodeCursor(encodeCursor({ k: "rank", o: 50 }))).toEqual({ k: "rank", o: 50 });
    expect(decodeCursor("not-base64-json")).toBeNull();
    expect(decodeCursor(Buffer.from(JSON.stringify({ k: "rank", o: -1 })).toString("base64url"))).toBeNull();
    expect(decodeCursor(Buffer.from(JSON.stringify({ k: "recent", t: "x", id: "1; drop" })).toString("base64url"))).toBeNull();
    expect(decodeCursor(null)).toBeNull();
  });

  it("builds the keyset condition with parameters", () => {
    const q = dialect.sqlToQuery(afterRecencyCursor({ t: "2026-10-17 21:44:19.586331+00", id: A }));
    expect(q.sql).toContain(`< $1::timestamptz or (coalesce("people"."last_interaction_at", "people"."created_at") = $2::timestamptz and "people"."id" > $3)`);
    expect(q.params).toEqual(["2026-10-17 21:44:19.586331+00", "2026-10-17 21:44:19.586331+00", A]);
  });
});
