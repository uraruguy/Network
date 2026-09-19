import { tool } from "ai";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { CIRCLES, HOBBIES, WARMTH } from "@/lib/db/schema";
import { listCategories } from "@/lib/data/categories";
import { createNote, searchNotes } from "@/lib/data/notes";
import { createPerson, getPerson, listPeople } from "@/lib/data/people";
import { createReminder, listReminders } from "@/lib/data/reminders";
import { searchCities } from "@/lib/data/locations";

const { people } = schema;

function personSummary(p: Awaited<ReturnType<typeof listPeople>>[number]) {
  return {
    id: p.id,
    name: p.displayName,
    role: p.headline,
    company: p.company,
    city: p.homeLocation ? `${p.homeLocation.name}, ${p.homeLocation.country}` : null,
    categories: p.categories.map((c) => c.name),
    warmth: p.warmth,
    circle: p.circle,
    hobbies: p.hobbies,
    lastInteraction: p.lastInteractionAt,
    nextFollowup: p.nextFollowupAt,
    metContext: p.metContext,
  };
}

async function resolvePerson(ownerId: string, ref: { id?: string | null; name?: string | null }) {
  if (ref.id) return getPerson(ownerId, ref.id);
  if (ref.name) {
    const hits = await listPeople(ownerId, { q: ref.name });
    if (hits.length === 1) return getPerson(ownerId, hits[0]!.id);
    if (hits.length > 1) {
      const exact = hits.find((h) => h.displayName.toLowerCase() === ref.name!.toLowerCase());
      if (exact) return getPerson(ownerId, exact.id);
    }
  }
  return null;
}

/** Tools the chat assistant can call. All scoped to the signed-in owner. */
export function networkTools(ownerId: string) {
  return {
    search_people: tool({
      description: "Search people in the network by free text (name, role, company). Optionally filter by category name, warmth, or country code. Returns summaries.",
      inputSchema: z.object({
        query: z.string().optional().describe("Free text: name, role, company"),
        category: z.string().optional().describe("Category name, e.g. Mentor, Investor"),
        warmth: z.enum(WARMTH).optional(),
        circle: z.enum(CIRCLES).optional(),
        hobby: z.enum(HOBBIES).optional(),
        countryCode: z.string().length(2).optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
      execute: async ({ query, category, warmth, circle, hobby, countryCode, limit }) => {
        const cats = await listCategories(ownerId);
        const cat = category ? cats.find((c) => c.name.toLowerCase() === category.toLowerCase() || c.slug === category.toLowerCase()) : undefined;
        let rows = await listPeople(ownerId, { q: query, categoryId: cat?.id, warmth, countryCode });
        if (circle) rows = rows.filter((r) => r.circle === circle);
        if (hobby) rows = rows.filter((r) => r.hobbies.includes(hobby));
        return { count: rows.length, people: rows.slice(0, limit).map(personSummary) };
      },
    }),

    get_person: tool({
      description: "Get everything about one person: profile, how you met, notes (with text), follow-ups, who introduced them, who they introduced.",
      inputSchema: z.object({ id: z.string().uuid().optional(), name: z.string().optional() }),
      execute: async (ref) => {
        const p = await resolvePerson(ownerId, ref);
        if (!p) return { error: "No unique person found. Use search_people first." };
        return {
          ...personSummary(p as never),
          metAt: p.metAt,
          metLocation: p.metLocation ? `${p.metLocation.name}, ${p.metLocation.country}` : null,
          introducedBy: p.introducedBy?.displayName ?? null,
          introduced: p.introduced.map((q) => q.displayName),
          email: p.email, phone: p.phone, linkedin: p.linkedin, x: p.xHandle, website: p.website, birthday: p.birthday,
          howICanHelp: p.howICanHelp, whatICanAsk: p.whatICanAsk,
          notes: p.notes.map((n) => ({ id: n.id, title: n.title, kind: n.kind, date: n.occurredAt, text: n.contentText.slice(0, 2000) })),
          followUps: p.reminders.map((r) => ({ id: r.id, due: r.dueAt, message: r.message, status: r.status, recurrence: r.recurrence })),
          url: `/people/${p.id}`,
        };
      },
    }),

    people_in_location: tool({
      description: "People who live in a given city or country.",
      inputSchema: z.object({ place: z.string().describe("City or country name, e.g. Berlin, Slovenia, San Francisco") }),
      execute: async ({ place }) => {
        // Single-user scale: fetch everyone with a home and filter in JS (handles city, region and country in one go).
        const all = await db.query.people.findMany({ where: and(eq(people.ownerId, ownerId), isNull(people.deletedAt)), with: { homeLocation: true, categories: { with: { category: true } } } });
        const q = place.toLowerCase();
        const hits = all.filter((p) => p.homeLocation && (p.homeLocation.name.toLowerCase().includes(q) || p.homeLocation.country.toLowerCase().includes(q) || (p.homeLocation.admin ?? "").toLowerCase().includes(q)));
        return { count: hits.length, people: hits.map((p) => personSummary({ ...p, categories: p.categories.map((pc) => pc.category) } as never)) };
      },
    }),

    due_followups: tool({
      description: "Follow-up reminders due within the next N days (default 7), oldest first.",
      inputSchema: z.object({ days: z.number().int().min(0).max(365).default(7) }),
      execute: async ({ days }) => {
        const until = new Date();
        until.setDate(until.getDate() + days);
        const rows = await listReminders(ownerId, { until });
        return rows.map((r) => ({ id: r.id, personId: r.person.id, person: r.person.displayName, due: r.dueAt, message: r.message, status: r.status }));
      },
    }),

    search_notes: tool({
      description: "Full-text search across all notes. Use for 'who mentioned X', 'what did we discuss about Y'.",
      inputSchema: z.object({ query: z.string().min(2), limit: z.number().int().min(1).max(30).default(10) }),
      execute: async ({ query, limit }) => {
        const rows = await searchNotes(ownerId, query, limit);
        return rows.map((n) => ({ id: n.id, person: n.person.displayName, personId: n.personId, title: n.title, date: n.occurredAt, excerpt: excerpt(n.contentText, query) }));
      },
    }),

    create_note: tool({
      description: "Add a note to a person. Use when the user asks to note/remember something about someone. Confirm the person first if ambiguous.",
      inputSchema: z.object({ personId: z.string().uuid(), text: z.string().min(1), kind: z.enum(["note", "meeting", "call", "message"]).default("note"), title: z.string().optional() }),
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
        return { ok: true, reminderId: r?.id, due: r?.dueAt };
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
        warmth: z.enum(WARMTH).default("active"),
        circle: z.enum(CIRCLES).optional(),
        hobbies: z.array(z.enum(HOBBIES)).default([]),
        introducedByPersonId: z.string().uuid().optional(),
      }),
      execute: async (input) => {
        const cats = await listCategories(ownerId);
        const categoryIds = input.categories.map((n) => cats.find((c) => c.name.toLowerCase() === n.toLowerCase() || c.slug === n.toLowerCase())?.id).filter((x): x is string => !!x);
        let homeLocation = null;
        if (input.city) {
          const [c] = await searchCities(input.city, 1);
          if (c) homeLocation = { cityId: c.id, name: c.name, admin: c.admin, country: c.country, countryCode: c.countryCode, lat: c.lat, lng: c.lng, timezone: c.timezone };
        }
        const p = await createPerson(ownerId, {
          displayName: input.name, headline: input.role ?? null, company: input.company ?? null, homeLocation, metContext: input.metContext ?? null, metAt: input.metDate ?? null, metLocation: null,
          warmth: input.warmth, circle: input.circle ?? null, hobbies: input.hobbies, hobbiesOther: null, categoryIds, introducedById: input.introducedByPersonId ?? null,
          firstName: null, lastName: null, email: null, phone: null, linkedin: null, xHandle: null, instagram: null, website: null, birthday: null, languages: [], interests: [], howICanHelp: null, whatICanAsk: null, followupCadenceDays: null, nextFollowupAt: null,
        }, { kind: "chat", ref: "assistant" });
        return { ok: true, personId: p.id, url: `/people/${p.id}`, city: p.homeLocation?.name ?? null };
      },
    }),
  };
}

function excerpt(text: string, q: string, span = 160) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text.slice(0, span);
  const start = Math.max(0, i - span / 2);
  return (start > 0 ? "…" : "") + text.slice(start, start + span) + (start + span < text.length ? "…" : "");
}
