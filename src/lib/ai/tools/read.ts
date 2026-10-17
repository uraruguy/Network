import "server-only";
import { z } from "zod";
import { CIRCLES, NOTE_KINDS, WARMTH } from "@/lib/constants";
import { listNotes, searchNotes } from "@/lib/data/notes";
import { getPerson, peopleByPlace, recentInteractions, searchPeople, type PersonIndexRow } from "@/lib/data/people";
import { listReminders } from "@/lib/data/reminders";
import { listTaxonomy } from "@/lib/data/tags";
import { countryCodeFor, locationIdsForCity, recentNotesIn } from "./queries";
import { defineOp, ToolError } from "./registry";
import { clip, compact, day, idsFor, names, parseDate, personRow, place, resolvePersonId } from "./shared";

/** Read-only operations. */

const isoDate = z.string().max(40).describe("Date (YYYY-MM-DD) or ISO date-time");
const personRef = {
  personId: z.string().uuid().optional().describe("The person's id (preferred; from the people index or search_people)"),
  personName: z.string().min(1).max(200).optional().describe("Full name, when you don't have the id"),
};

export const searchPeopleOp = defineOp({
  name: "search_people",
  title: "Search people",
  description:
    "Find people by free text (name, role, company, how you met — fuzzy and accent-insensitive) and/or filters. Filters combine with AND; values inside one filter with OR. Categories, tags and activities accept names (e.g. \"Mentor\", \"Hiking\") or ids. Use it for questions like \"who can I go hiking with in Ljubljana\" (activities + city) or \"investors I haven't talked to since June\" (categories + lastContactBefore). Returns up to `limit` compact rows, best match first (or most recently in touch without a query); pass `nextCursor` back as `cursor` for more.",
  access: "read",
  input: z.object({
    query: z.string().max(200).optional().describe("Free text: name, role, company, context"),
    categories: z.array(z.string().max(80)).max(20).optional().describe("Category names or ids, e.g. [\"Mentor\", \"Investor\"]"),
    tags: z.array(z.string().max(80)).max(20).optional().describe("Tag names or ids"),
    activities: z.array(z.string().max(80)).max(20).optional().describe("Activity names or ids, e.g. [\"Hiking\", \"Football\"]"),
    warmth: z.array(z.enum(WARMTH)).max(4).optional().describe("inner = closest, active, dormant, archive"),
    circle: z.array(z.enum(CIRCLES)).max(3).optional(),
    city: z.string().max(120).optional().describe("Home city name, e.g. \"Ljubljana\" (exact city; use people_by_place for a radius)"),
    country: z.string().max(80).optional().describe("Country name or ISO code, e.g. \"Germany\" or \"DE\""),
    lastContactBefore: isoDate.optional().describe("Only people not in touch since this date"),
    limit: z.number().int().min(1).max(50).default(20),
    cursor: z.string().max(500).optional().describe("nextCursor from a previous call"),
  }),
  async run(ctx, input) {
    const n = await names(ctx);
    const countryCode = input.country ? await countryCodeFor(ctx.ownerId, input.country) : undefined;
    if (input.country && !countryCode) return { count: 0, people: [], note: `Nobody lives in ${input.country} (no matching country among home cities).` };
    const filters = {
      q: input.query?.trim() || undefined,
      categoryIds: idsFor(input.categories, n.categories, "categories"),
      tagIds: idsFor(input.tags, n.tags, "tags"),
      activityIds: idsFor(input.activities, n.activities, "activities"),
      warmth: input.warmth,
      circle: input.circle,
      countryCode: countryCode ?? undefined,
      lastContactBefore: parseDate(input.lastContactBefore, "lastContactBefore"),
    };

    let rows: PersonIndexRow[];
    let nextCursor: string | null = null;
    if (input.city) {
      const locs = await locationIdsForCity(ctx.ownerId, input.city, countryCode);
      if (!locs.length) return { count: 0, people: [], note: `Nobody lives in “${input.city}”. Try people_by_place for people nearby.` };
      // A city can exist as more than one location (e.g. added by hand twice): query each, merge.
      const pages = await Promise.all(locs.slice(0, 3).map((l) => searchPeople(ctx.ownerId, { ...filters, locationId: l.id }, { limit: input.limit, cursor: locs.length === 1 ? input.cursor : null })));
      rows = [...new Map(pages.flatMap((p) => p.items).map((p) => [p.id, p])).values()].slice(0, input.limit);
      nextCursor = locs.length === 1 ? pages[0]!.nextCursor : null;
    } else {
      const page = await searchPeople(ctx.ownerId, filters, { limit: input.limit, cursor: input.cursor });
      rows = page.items;
      nextCursor = page.nextCursor;
    }
    return { count: rows.length, people: rows.map((p) => personRow(p, n, ctx.timezone)), ...(nextCursor ? { nextCursor } : {}) };
  },
});

export const getPersonOp = defineOp({
  name: "get_person",
  title: "Get person",
  description:
    "Everything important about one person: profile, how you met, categories/activities/tags, counts, the 5 latest note excerpts, open follow-ups, who introduced them and whom they introduced. Give personId (preferred) or personName. For the full text of past conversations use list_notes.",
  access: "read",
  input: z.object(personRef),
  async run(ctx, input) {
    const { id } = await resolvePersonId(ctx, input);
    const [p, n] = await Promise.all([getPerson(ctx.ownerId, id), names(ctx)]);
    if (!p) throw new ToolError("not_found", "That person no longer exists.");
    const notes = p.notes
      .slice()
      .sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt))
      .slice(0, 5);
    return compact({
      id: p.id,
      name: p.displayName,
      headline: p.headline,
      company: p.company,
      city: place(p.homeLocation),
      categories: p.categories.map((c) => c.name),
      activities: p.activityIds.map((a) => n.activities.get(a)).filter(Boolean),
      tags: p.tags.map((t) => t.name),
      warmth: p.warmth,
      circle: p.circle,
      metContext: clip(p.metContext, 600),
      metOn: p.metAt,
      metIn: place(p.metLocation),
      introducedBy: p.introducedBy ? { id: p.introducedBy.id, name: p.introducedBy.displayName } : null,
      introduced: p.introduced.slice(0, 10).map((q) => ({ id: q.id, name: q.displayName })),
      contact: compact({ email: p.email, phone: p.phone, linkedin: p.linkedin, x: p.xHandle, instagram: p.instagram, website: p.website }),
      birthday: p.birthday,
      languages: p.languages,
      interests: p.interests,
      howICanHelp: clip(p.howICanHelp, 400),
      whatICanAsk: clip(p.whatICanAsk, 400),
      lastContact: day(p.lastInteractionAt, ctx.timezone),
      counts: { notes: p.notesCount, openFollowUps: p.reminders.length, mentionedInOtherNotes: p.mentions.length },
      latestNotes: notes.map((x) => compact({ id: x.id, date: day(x.occurredAt, ctx.timezone), kind: x.kind, title: x.title, excerpt: clip(x.excerpt) })),
      openFollowUps: p.reminders.slice(0, 10).map((r) => compact({ id: r.id, due: day(r.dueAt, ctx.timezone), message: clip(r.message, 200), recurrence: r.recurrence === "none" ? null : r.recurrence })),
      url: `/people/${p.id}`,
    });
  },
});

/** Total characters of full note text one list_notes call returns before falling back to excerpts. */
const FULL_TEXT_BUDGET = 9000;

export const listNotesOp = defineOp({
  name: "list_notes",
  title: "List notes",
  description:
    "A person's notes (meetings, calls, messages, notes), newest first — the answer to \"what did we discuss last time?\". Excerpts by default; `full: true` returns the whole text (use a small limit, e.g. 3). Page back with `before` = nextCursor.",
  access: "read",
  input: z.object({
    ...personRef,
    limit: z.number().int().min(1).max(20).default(5),
    before: z.string().max(500).optional().describe("nextCursor from a previous call"),
    full: z.boolean().default(false).describe("Include the full note text"),
  }),
  async run(ctx, input) {
    const person = await resolvePersonId(ctx, input);
    const { items, nextCursor } = await listNotes(ctx.ownerId, person.id, { before: input.before, limit: input.limit, full: input.full });
    let budget = FULL_TEXT_BUDGET;
    const notes = items.map((x) => {
      const fullText = "contentText" in x ? (x.contentText as string) : null;
      let text: string;
      if (fullText !== null && budget > 0) {
        text = clip(fullText, Math.min(budget, 4000));
        budget -= text.length;
      } else text = clip(x.excerpt);
      return compact({ id: x.id, date: day(x.occurredAt, ctx.timezone), kind: x.kind, title: x.title, pinned: x.pinned || null, text });
    });
    return compact({ person: { id: person.id, name: person.name }, count: notes.length, notes, nextCursor });
  },
});

export const recentInteractionsOp = defineOp({
  name: "recent_interactions",
  title: "Recent interactions",
  description:
    "Who you were in touch with recently. Without personId/kind: people with notes in the last `days`, newest first, each with their latest note. With personId and/or kind (meeting, call, message, note): the individual interactions (notes) in that window.",
  access: "read",
  input: z.object({
    days: z.number().int().min(1).max(365).default(30),
    personId: z.string().uuid().optional(),
    kind: z.enum(NOTE_KINDS).optional(),
    limit: z.number().int().min(1).max(20).default(10),
  }),
  async run(ctx, input) {
    if (input.personId || input.kind) {
      const rows = await recentNotesIn(ctx.ownerId, input);
      return {
        days: input.days,
        count: rows.length,
        interactions: rows.map((r) => compact({ noteId: r.noteId, personId: r.personId, person: r.personName, date: day(r.occurredAt, ctx.timezone), kind: r.kind, title: r.title, excerpt: clip(r.excerpt, 200) })),
      };
    }
    const [rows, n] = await Promise.all([recentInteractions(ctx.ownerId, { days: input.days, limit: input.limit }), names(ctx)]);
    return {
      days: input.days,
      count: rows.length,
      people: rows.map((r) => ({
        ...personRow(r, n, ctx.timezone),
        notesInPeriod: r.notesInPeriod,
        lastNote: r.lastNote ? compact({ id: r.lastNote.id, date: day(r.lastNote.occurredAt, ctx.timezone), kind: r.lastNote.kind, title: r.lastNote.title, excerpt: clip(r.lastNote.excerpt, 200) }) : null,
      })),
    };
  },
});

export const searchNotesOp = defineOp({
  name: "search_notes",
  title: "Search notes",
  description:
    "Full-text search across all notes (accent-insensitive, prefix matching). Syntax: words are AND-ed; \"quoted phrase\"; -exclude; upper-case OR for alternatives. Notes are written in a mix of Slovenian and English, so ALWAYS include both language variants of key terms with OR, e.g. `hiking OR pohod OR hribi`, `investor OR investitor OR vlagatelj`. Use for \"who mentioned X\", \"where did I write about Y\".",
  access: "read",
  input: z.object({
    query: z.string().min(2).max(300),
    personId: z.string().uuid().optional().describe("Only this person's notes"),
    since: isoDate.optional(),
    until: isoDate.optional(),
    limit: z.number().int().min(1).max(20).default(10),
  }),
  async run(ctx, input) {
    const rows = await searchNotes(ctx.ownerId, {
      query: input.query,
      personId: input.personId,
      since: parseDate(input.since, "since"),
      until: parseDate(input.until, "until"),
      limit: input.limit,
    });
    return {
      count: rows.length,
      notes: rows.map((r) => compact({ id: r.id, personId: r.personId, person: r.personName, date: day(r.occurredAt, ctx.timezone), kind: r.kind, title: r.title, snippet: clip(r.snippet, 320) })),
    };
  },
});

export const peopleByPlaceOp = defineOp({
  name: "people_by_place",
  title: "People by place",
  description:
    "People who live in or near a place: a country (name or code — everyone there) or a city (everyone within radiusKm, default 50, nearest first). Use for travel planning: \"who do I know around Munich?\"",
  access: "read",
  input: z.object({
    place: z.string().min(1).max(120).describe("City or country, e.g. \"Berlin\", \"Slovenia\", \"US\""),
    radiusKm: z.number().min(1).max(2000).optional(),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  async run(ctx, input) {
    const [res, n] = await Promise.all([peopleByPlace(ctx.ownerId, input.place, { radiusKm: input.radiusKm, limit: input.limit }), names(ctx)]);
    if (!res.place) throw new ToolError("not_found", `Unknown place: ${input.place}.`, "Try a larger nearby city or the country name.");
    const where = res.place.kind === "country" ? { kind: "country", name: res.place.name } : { kind: "city", name: `${res.place.name}${res.place.country ? `, ${res.place.country}` : ""}`, radiusKm: res.place.radiusKm };
    return {
      place: where,
      count: res.people.length,
      people: res.people.map((p) => ({ ...personRow(p, n, ctx.timezone), ...(p.distanceKm !== null ? { distanceKm: p.distanceKm } : {}) })),
    };
  },
});

export const dueFollowupsOp = defineOp({
  name: "due_followups",
  title: "Due follow-ups",
  description: "Open follow-up reminders due within the next `days` (default 7), soonest first. Overdue ones are included unless includeOverdue is false.",
  access: "read",
  input: z.object({
    days: z.number().int().min(0).max(365).default(7),
    includeOverdue: z.boolean().default(true),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  async run(ctx, input) {
    const until = new Date(Date.now() + input.days * 86_400_000);
    const now = Date.now();
    const rows = (await listReminders(ctx.ownerId, { until })).filter((r) => input.includeOverdue || +new Date(r.dueAt) >= now);
    return {
      count: Math.min(rows.length, input.limit),
      more: rows.length > input.limit || undefined,
      followUps: rows.slice(0, input.limit).map((r) =>
        compact({
          id: r.id,
          personId: r.person.id,
          person: r.person.displayName,
          due: day(r.dueAt, ctx.timezone),
          overdue: +new Date(r.dueAt) < now || null,
          message: clip(r.message, 200),
          recurrence: r.recurrence === "none" ? null : r.recurrence,
        }),
      ),
    };
  },
});

export const listTaxonomyOp = defineOp({
  name: "list_taxonomy",
  title: "List categories, activities and tags",
  description: "The categories, activities and tags in use, with how many people have each. Use the names as filters in search_people.",
  access: "read",
  input: z.object({}),
  async run(ctx) {
    const t = await listTaxonomy(ctx.ownerId);
    return {
      categories: t.categories.map((c) => ({ name: c.name, people: c.count })),
      activities: t.activities.map((a) => compact({ name: a.name, emoji: a.emoji, people: a.count })),
      tags: t.tags.map((x) => ({ name: x.name, people: x.count })),
      warmth: ["inner", "active", "dormant", "archive"],
      circles: ["nice_to_know", "hang_out_more", "potential_close"],
    };
  },
});

export const READ_OPS = [searchPeopleOp, getPersonOp, listNotesOp, recentInteractionsOp, searchNotesOp, peopleByPlaceOp, dueFollowupsOp, listTaxonomyOp] as const;
