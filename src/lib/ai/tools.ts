import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { CIRCLES, NOTE_KINDS, WARMTH } from "@/lib/constants";
import { listCategories } from "@/lib/data/categories";
import { listActivities } from "@/lib/data/activities";
import { createNote, listNotes, searchNotes } from "@/lib/data/notes";
import { createPerson, getPerson, peopleByPlace, recentInteractions, searchPeople, type PersonIndexRow } from "@/lib/data/people";
import { createReminder, listReminders } from "@/lib/data/reminders";
import { searchCities } from "@/lib/data/locations";
import { listTaxonomy } from "@/lib/data/tags";

type Names = { categories: Map<string, string>; activities: Map<string, string> };

async function nameMaps(ownerId: string): Promise<Names> {
  const [cats, acts] = await Promise.all([listCategories(ownerId), listActivities(ownerId)]);
  return { categories: new Map(cats.map((c) => [c.id, c.name])), activities: new Map(acts.map((a) => [a.id, a.name])) };
}

function personSummary(p: PersonIndexRow, names: Names) {
  return {
    id: p.id,
    name: p.displayName,
    role: p.headline,
    company: p.company,
    city: p.homeLocation ? `${p.homeLocation.name}, ${p.homeLocation.country}` : null,
    categories: p.categoryIds.map((id) => names.categories.get(id)).filter(Boolean),
    activities: p.activityIds.map((id) => names.activities.get(id)).filter(Boolean),
    warmth: p.warmth,
    circle: p.circle,
    lastInteraction: p.lastInteractionAt,
    nextFollowup: p.nextFollowupAt,
  };
}

/** Resolves names (case-insensitive, by name or slug) to ids. */
function idsFor(names: string[] | undefined, map: Map<string, string>) {
  if (!names?.length) return undefined;
  const wanted = names.map((n) => n.toLowerCase());
  return [...map].filter(([, name]) => wanted.includes(name.toLowerCase())).map(([id]) => id);
}

async function resolvePerson(ownerId: string, ref: { id?: string | null; name?: string | null }) {
  if (ref.id) return getPerson(ownerId, ref.id);
  if (ref.name) {
    const { items } = await searchPeople(ownerId, { q: ref.name }, { limit: 5 });
    const exact = items.find((h) => h.displayName.toLowerCase() === ref.name!.toLowerCase());
    if (exact) return getPerson(ownerId, exact.id);
    if (items.length === 1) return getPerson(ownerId, items[0]!.id);
  }
  return null;
}

/** Tools the chat assistant can call. All scoped to the signed-in owner. */
export function networkTools(ownerId: string) {
  return {
    search_people: tool({
      description:
        "Search people by free text (name, role, company, how you met — fuzzy and accent-insensitive) and/or filters (category, activity, warmth, circle, country, not contacted since). Returns summaries, best matches first.",
      inputSchema: z.object({
        query: z.string().optional().describe("Free text: name, role, company, context"),
        categories: z.array(z.string()).optional().describe("Category names, e.g. Mentor, Investor (matches any)"),
        activities: z.array(z.string()).optional().describe("Activity names, e.g. Football, Dinners (matches any)"),
        warmth: z.array(z.enum(WARMTH)).optional(),
        circle: z.array(z.enum(CIRCLES)).optional(),
        countryCode: z.string().length(2).optional(),
        notContactedSince: z.string().optional().describe("ISO date: only people not in touch since then"),
        limit: z.number().int().min(1).max(50).default(20),
      }),
      execute: async ({ query, categories, activities, warmth, circle, countryCode, notContactedSince, limit }) => {
        const names = await nameMaps(ownerId);
        const since = notContactedSince ? new Date(notContactedSince) : undefined;
        const { items, nextCursor } = await searchPeople(
          ownerId,
          {
            q: query,
            categoryIds: idsFor(categories, names.categories),
            activityIds: idsFor(activities, names.activities),
            warmth,
            circle,
            countryCode,
            lastContactBefore: since && !Number.isNaN(since.getTime()) ? since : undefined,
          },
          { limit },
        );
        return { count: items.length, more: !!nextCursor, people: items.map((p) => personSummary(p, names)) };
      },
    }),

    get_person: tool({
      description: "Everything about one person: profile, how you met, recent notes, follow-ups, who introduced them, who they introduced.",
      inputSchema: z.object({ id: z.string().uuid().optional(), name: z.string().optional() }),
      execute: async (ref) => {
        const p = await resolvePerson(ownerId, ref);
        if (!p) return { error: "No unique person found. Use search_people first." };
        const names = await nameMaps(ownerId);
        const { items: notes } = await listNotes(ownerId, p.id, { limit: 20, full: true });
        return {
          id: p.id,
          name: p.displayName,
          role: p.headline,
          company: p.company,
          city: p.homeLocation ? `${p.homeLocation.name}, ${p.homeLocation.country}` : null,
          categories: p.categories.map((c) => c.name),
          activities: p.activityIds.map((id) => names.activities.get(id)).filter(Boolean),
          tags: p.tags.map((t) => t.name),
          warmth: p.warmth,
          circle: p.circle,
          metContext: p.metContext,
          metAt: p.metAt,
          metLocation: p.metLocation ? `${p.metLocation.name}, ${p.metLocation.country}` : null,
          introducedBy: p.introducedBy?.displayName ?? null,
          introduced: p.introduced.map((q) => q.displayName),
          email: p.email, phone: p.phone, linkedin: p.linkedin, x: p.xHandle, website: p.website, birthday: p.birthday,
          howICanHelp: p.howICanHelp, whatICanAsk: p.whatICanAsk,
          lastInteraction: p.lastInteractionAt,
          notesCount: p.notesCount,
          notes: notes.map((n) => ({ id: n.id, title: n.title, kind: n.kind, date: n.occurredAt, text: (n.contentText ?? n.excerpt).slice(0, 2000) })),
          followUps: p.reminders.map((r) => ({ id: r.id, due: r.dueAt, message: r.message, status: r.status, recurrence: r.recurrence })),
          mentionedIn: p.mentions.slice(0, 10).map((m) => ({ noteId: m.note.id, about: m.note.personName, date: m.note.occurredAt, excerpt: m.note.excerpt })),
          url: `/people/${p.id}`,
        };
      },
    }),

    people_in_location: tool({
      description: "People who live in or near a place: a country (name or code) or a city (with radius in km, default 50).",
      inputSchema: z.object({
        place: z.string().describe("City or country, e.g. Berlin, Slovenia, SI, San Francisco"),
        radiusKm: z.number().min(1).max(2000).optional(),
      }),
      execute: async ({ place, radiusKm }) => {
        const names = await nameMaps(ownerId);
        const res = await peopleByPlace(ownerId, place, { radiusKm });
        if (!res.place) return { error: `Unknown place: ${place}` };
        return { place: res.place, count: res.people.length, people: res.people.map((p) => ({ ...personSummary(p, names), distanceKm: p.distanceKm })) };
      },
    }),

    recent_interactions: tool({
      description: "People you were in touch with recently (by notes), newest first, with their latest note.",
      inputSchema: z.object({ days: z.number().int().min(1).max(365).default(30), limit: z.number().int().min(1).max(50).default(20) }),
      execute: async ({ days, limit }) => {
        const names = await nameMaps(ownerId);
        const rows = await recentInteractions(ownerId, { days, limit });
        return rows.map((r) => ({ ...personSummary(r, names), notesInPeriod: r.notesInPeriod, lastNote: r.lastNote }));
      },
    }),

    list_taxonomy: tool({
      description: "Categories, activities and tags in use, with how many people have each.",
      inputSchema: z.object({}),
      execute: async () => {
        const t = await listTaxonomy(ownerId);
        return {
          categories: t.categories.map((c) => ({ name: c.name, count: c.count })),
          activities: t.activities.map((a) => ({ name: a.name, emoji: a.emoji, count: a.count })),
          tags: t.tags.map((x) => ({ name: x.name, count: x.count })),
        };
      },
    }),

    due_followups: tool({
      description: "Follow-up reminders due within the next N days (default 7), oldest first (includes overdue).",
      inputSchema: z.object({ days: z.number().int().min(0).max(365).default(7) }),
      execute: async ({ days }) => {
        const until = new Date();
        until.setDate(until.getDate() + days);
        const rows = await listReminders(ownerId, { until });
        return rows.map((r) => ({ id: r.id, personId: r.person.id, person: r.person.displayName, due: r.dueAt, message: r.message, status: r.status }));
      },
    }),

    search_notes: tool({
      description: "Full-text search across all notes (accent-insensitive, prefix matching, \"quoted phrases\", -exclusions, OR). Use for 'who mentioned X', 'what did we discuss about Y'.",
      inputSchema: z.object({
        query: z.string().min(2),
        personId: z.string().uuid().optional(),
        since: z.string().optional().describe("ISO date"),
        limit: z.number().int().min(1).max(30).default(10),
      }),
      execute: async ({ query, personId, since, limit }) => {
        const s = since ? new Date(since) : undefined;
        const rows = await searchNotes(ownerId, { query, personId, since: s && !Number.isNaN(s.getTime()) ? s : undefined, limit });
        return rows.map((n) => ({ id: n.id, person: n.personName, personId: n.personId, title: n.title, date: n.occurredAt, snippet: n.snippet }));
      },
    }),

    create_note: tool({
      description: "Add a note to a person. Use when the user asks to note/remember something about someone. Confirm the person first if ambiguous.",
      inputSchema: z.object({ personId: z.string().uuid(), text: z.string().min(1), kind: z.enum(NOTE_KINDS).default("note"), title: z.string().optional() }),
      execute: async ({ personId, text, kind, title }) => {
        const n = await createNote(ownerId, { personId, title: title ?? null, contentJson: null, contentMd: text, contentText: text, kind, pinned: false, mentionIds: [] }, { kind: "chat", ref: "assistant" });
        return { ok: true, noteId: n.id, url: `/people/${personId}/notes/${n.id}` };
      },
    }),

    create_reminder: tool({
      description: "Schedule a follow-up reminder for a person. dueAt must be an ISO date-time in the future.",
      inputSchema: z.object({ personId: z.string().uuid(), dueAt: z.string(), message: z.string().optional(), recurrence: z.enum(["none", "monthly", "quarterly", "semiannual", "yearly"]).default("none") }),
      execute: async ({ personId, dueAt, message, recurrence }) => {
        const d = new Date(dueAt);
        if (Number.isNaN(d.getTime())) return { error: "Invalid dueAt" };
        const r = await createReminder(ownerId, { personId, dueAt: d.toISOString(), message: message ?? null, recurrence, recurrenceDays: null });
        if (!r) return { error: "Unknown person" };
        return { ok: true, reminderId: r.id, due: r.dueAt };
      },
    }),

    create_person: tool({
      description: "Add a new person to the network. Only after the user clearly asked to add someone. City is resolved automatically.",
      inputSchema: z.object({
        name: z.string().min(1),
        role: z.string().optional(),
        company: z.string().optional(),
        city: z.string().optional(),
        metContext: z.string().optional(),
        metDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        categories: z.array(z.string()).default([]).describe("Category names"),
        activities: z.array(z.string()).default([]).describe("Activity names, e.g. Football, Dinners"),
        tags: z.array(z.string()).default([]),
        warmth: z.enum(WARMTH).default("active"),
        circle: z.enum(CIRCLES).optional(),
        introducedByPersonId: z.string().uuid().optional(),
      }),
      execute: async (input) => {
        const names = await nameMaps(ownerId);
        let homeLocation = null;
        if (input.city) {
          const [c] = await searchCities(input.city, 1);
          if (c) homeLocation = { cityId: c.id, name: c.name, admin: c.admin, country: c.country, countryCode: c.countryCode, lat: c.lat, lng: c.lng, timezone: c.timezone };
        }
        const person = await createPerson(
          ownerId,
          {
            displayName: input.name, headline: input.role ?? null, company: input.company ?? null, homeLocation, metContext: input.metContext ?? null, metAt: input.metDate ?? null, metLocation: null,
            warmth: input.warmth, circle: input.circle ?? null, hobbiesOther: null,
            categoryIds: idsFor(input.categories, names.categories) ?? [],
            activityIds: idsFor(input.activities, names.activities) ?? [],
            tagNames: input.tags,
            introducedById: input.introducedByPersonId ?? null,
            firstName: null, lastName: null, email: null, phone: null, linkedin: null, xHandle: null, instagram: null, website: null, birthday: null, languages: [], interests: [], howICanHelp: null, whatICanAsk: null, followupCadenceDays: null, nextFollowupAt: null,
          },
          { kind: "chat", ref: "assistant" },
        );
        return { ok: true, personId: person.id, url: `/people/${person.id}`, city: person.homeLocation?.name ?? null };
      },
    }),
  };
}
