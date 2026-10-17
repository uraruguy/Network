import "server-only";
import { z } from "zod";
import { CIRCLES, NOTE_KINDS, WARMTH } from "@/lib/constants";
import { createActivity } from "@/lib/data/activities";
import { searchCities } from "@/lib/data/locations";
import { createNote } from "@/lib/data/notes";
import { createPerson, getPerson, searchPeople, updatePerson } from "@/lib/data/people";
import { completeReminder, createReminder } from "@/lib/data/reminders";
import { personInput, personPatch, reminderInput, type LocationInput } from "@/lib/schemas";
import { normalizeForSearch } from "@/components/ui/search";
import { defineOp, sourceOf, ToolError, type ToolCtx } from "./registry";
import { day, idsFor, names, parseDate, resolvePersonId } from "./shared";
import { resolveDue } from "./time";

/**
 * Write operations. They need the `network:write` scope, are audited and rate-limited by the
 * registry, and stamp what they create with `source_kind` (chat | mcp) and `source_ref` (client).
 * Nothing here deletes.
 */

const personRef = {
  personId: z.string().uuid().optional().describe("The person's id (preferred)"),
  personName: z.string().min(1).max(200).optional().describe("Full name, when you don't have the id"),
};
const shortText = (max: number) => z.string().max(max);

/** Resolves a city name to a location via the cities dataset (most populous match). */
async function cityLocation(city: string): Promise<LocationInput> {
  const [c] = await searchCities(city, 1);
  if (!c) throw new ToolError("invalid_input", `Unknown city: ${city}.`, "Use the city's common English or local name, e.g. \"Lisbon\".");
  return { cityId: c.id, name: c.name, admin: c.admin, country: c.country, countryCode: c.countryCode, lat: c.lat, lng: c.lng, timezone: c.timezone };
}

/** Activity ids for names, creating activities that don't exist yet (idempotent by slug). */
async function activityIdsCreating(ctx: ToolCtx, values: readonly string[]): Promise<string[]> {
  if (!values.length) return [];
  const n = await names(ctx);
  const ids: string[] = [];
  for (const v of values) {
    try {
      ids.push(...(idsFor([v], n.activities, "activities") ?? []));
    } catch {
      const created = await createActivity(ctx.ownerId, { name: v });
      if (created.status !== "ok") throw new ToolError("invalid_input", `Can't create activity “${v}”.`);
      ids.push(created.activity.id);
    }
  }
  return [...new Set(ids)];
}

/** The validation message of a schema parse, as a ToolError. */
function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new ToolError("invalid_input", r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return r.data;
}

export const addNoteOp = defineOp({
  name: "add_note",
  title: "Add note",
  description:
    "Add a note to a person's timeline — use when the user asks to note, log or remember something about someone (a meeting, call, message or fact). Write the note in the user's words and language. If the person is ambiguous, ask first.",
  access: "write",
  input: z.object({
    ...personRef,
    text: z.string().min(1).max(20_000).describe("The note (markdown allowed)"),
    kind: z.enum(NOTE_KINDS).default("note").describe("meeting, call, message or note"),
    occurredAt: z.string().max(40).optional().describe("When it happened (YYYY-MM-DD or ISO date-time); default now"),
    title: shortText(200).optional(),
  }),
  async run(ctx, input) {
    const person = await resolvePersonId(ctx, input);
    const when = parseDate(input.occurredAt, "occurredAt") ?? new Date();
    const note = await createNote(
      ctx.ownerId,
      { personId: person.id, title: input.title?.trim() || null, contentJson: null, contentMd: input.text, contentText: input.text, kind: input.kind, occurredAt: when.toISOString(), pinned: false, mentionIds: [] },
      sourceOf(ctx),
    );
    return { ok: true, noteId: note.id, person: person.name, personId: person.id, date: day(note.occurredAt, ctx.timezone), url: `/people/${person.id}/notes/${note.id}` };
  },
  audit: (r) => ({ entity: "note", entityId: r.noteId }),
});

const personFields = {
  headline: shortText(200).optional().describe("Role / one-line description"),
  company: shortText(200).optional(),
  city: shortText(120).optional().describe("Home city; resolved automatically"),
  metContext: shortText(2000).optional().describe("How/where you met"),
  metOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("YYYY-MM-DD"),
  warmth: z.enum(WARMTH).optional(),
  circle: z.enum(CIRCLES).optional(),
  email: shortText(200).optional(),
  phone: shortText(60).optional(),
  linkedin: shortText(300).optional(),
  website: shortText(300).optional(),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("YYYY-MM-DD"),
  howICanHelp: shortText(2000).optional(),
  whatICanAsk: shortText(2000).optional(),
};

export const createPersonOp = defineOp({
  name: "create_person",
  title: "Create person",
  description:
    "Add a new person to the network. Only when the user clearly asked to add someone. If someone with the same name already exists this fails with their id (use update_person, or set allowDuplicate when it really is a different person). Categories must exist (see list_taxonomy); new activities and tags are created as needed.",
  access: "write",
  input: z.object({
    name: z.string().min(1).max(200),
    ...personFields,
    categories: z.array(z.string().max(80)).max(20).optional().describe("Category names or ids"),
    activities: z.array(z.string().max(60)).max(30).optional().describe("Things you do together, e.g. [\"Hiking\"]"),
    tags: z.array(z.string().max(60)).max(30).optional(),
    introducedBy: z.string().uuid().optional().describe("Id of the person who introduced them"),
    allowDuplicate: z.boolean().default(false),
  }),
  async run(ctx, input) {
    if (!input.allowDuplicate) {
      const { items } = await searchPeople(ctx.ownerId, { q: input.name }, { limit: 5 });
      const twin = items.find((p) => normalizeForSearch(p.displayName) === normalizeForSearch(input.name));
      if (twin) throw new ToolError("invalid_input", `${twin.displayName} already exists (id ${twin.id}).`, "Use update_person for that person, or pass allowDuplicate: true if this is someone else.");
    }
    const n = await names(ctx);
    const data = parseOrThrow(personInput, {
      displayName: input.name,
      headline: input.headline,
      company: input.company,
      homeLocation: input.city ? await cityLocation(input.city) : null,
      metContext: input.metContext,
      metAt: input.metOn,
      warmth: input.warmth ?? "active",
      circle: input.circle,
      email: input.email,
      phone: input.phone,
      linkedin: input.linkedin,
      website: input.website,
      birthday: input.birthday,
      howICanHelp: input.howICanHelp,
      whatICanAsk: input.whatICanAsk,
      introducedById: input.introducedBy,
      categoryIds: idsFor(input.categories, n.categories, "categories") ?? [],
      activityIds: await activityIdsCreating(ctx, input.activities ?? []),
      tagNames: input.tags ?? [],
    });
    const person = await createPerson(ctx.ownerId, data, sourceOf(ctx));
    return { ok: true, personId: person.id, name: person.displayName, city: person.homeLocation?.name ?? null, url: `/people/${person.id}` };
  },
  audit: (r) => ({ entity: "person", entityId: r.personId }),
});

export const updatePersonOp = defineOp({
  name: "update_person",
  title: "Update person",
  description:
    "Change a person's details. Only the fields you pass change; pass an empty string to clear a text field. Tags and activities are added/removed incrementally (new ones are created); `categories` replaces the person's categories.",
  access: "write",
  input: z.object({
    ...personRef,
    name: z.string().min(1).max(200).optional().describe("New display name"),
    ...personFields,
    categories: z.array(z.string().max(80)).max(20).optional().describe("Replaces all categories (names or ids)"),
    addTags: z.array(z.string().max(60)).max(30).optional(),
    removeTags: z.array(z.string().max(60)).max(30).optional(),
    addActivities: z.array(z.string().max(60)).max(30).optional(),
    removeActivities: z.array(z.string().max(60)).max(30).optional(),
  }),
  async run(ctx, input) {
    const { id } = await resolvePersonId(ctx, input);
    const current = await getPerson(ctx.ownerId, id);
    if (!current) throw new ToolError("not_found", "That person no longer exists.");
    const n = await names(ctx);

    const patch: Record<string, unknown> = {};
    const text = ["headline", "company", "metContext", "email", "phone", "linkedin", "website", "howICanHelp", "whatICanAsk"] as const;
    for (const k of text) if (input[k] !== undefined) patch[k] = input[k];
    if (input.name !== undefined) patch.displayName = input.name;
    if (input.metOn !== undefined) patch.metAt = input.metOn;
    if (input.birthday !== undefined) patch.birthday = input.birthday;
    if (input.warmth) patch.warmth = input.warmth;
    if (input.circle) patch.circle = input.circle;
    if (input.city !== undefined) patch.homeLocation = input.city.trim() ? await cityLocation(input.city) : null;
    if (input.categories) patch.categoryIds = idsFor(input.categories, n.categories, "categories") ?? [];

    if (input.addTags?.length || input.removeTags?.length) {
      const drop = new Set((input.removeTags ?? []).map(normalizeForSearch));
      patch.tagNames = [...current.tags.map((t) => t.name), ...(input.addTags ?? [])].filter((t) => !drop.has(normalizeForSearch(t)));
    }
    if (input.addActivities?.length || input.removeActivities?.length) {
      const remove = new Set(
        (input.removeActivities ?? []).flatMap((v) => {
          try {
            return idsFor([v], n.activities, "activities") ?? [];
          } catch {
            return []; // removing something that doesn't exist is a no-op
          }
        }),
      );
      const add = await activityIdsCreating(ctx, input.addActivities ?? []);
      patch.activityIds = [...new Set([...current.activityIds, ...add])].filter((a) => !remove.has(a));
    }

    const changed = Object.keys(patch);
    if (!changed.length) throw new ToolError("invalid_input", "Nothing to change.", "Pass at least one field to update.");
    const updated = await updatePerson(ctx.ownerId, id, parseOrThrow(personPatch, patch));
    if (!updated) throw new ToolError("not_found", "That person no longer exists.");
    return {
      ok: true,
      personId: updated.id,
      name: updated.displayName,
      changed,
      tags: updated.tags.map((t) => t.name),
      activities: updated.activityIds.map((a) => n.activities.get(a)).filter(Boolean),
      categories: updated.categories.map((c) => c.name),
      url: `/people/${updated.id}`,
    };
  },
  audit: (r) => ({ entity: "person", entityId: r.personId }),
});

export const createFollowupOp = defineOp({
  name: "create_followup",
  title: "Create follow-up",
  description:
    "Schedule a follow-up reminder for a person (the owner gets it in the daily email and on the Today screen). Give dueAt (YYYY-MM-DD → 09:00 local, or an ISO date-time) or inDays from today. Convert relative phrases yourself (\"in 3 months\" → inDays: 90).",
  access: "write",
  input: z.object({
    ...personRef,
    dueAt: z.string().max(40).optional(),
    inDays: z.number().int().min(0).max(3650).optional(),
    message: z.string().min(1).max(500).describe("What to follow up about"),
    recurrence: z.enum(["none", "monthly", "quarterly", "semiannual", "yearly"]).default("none"),
  }),
  async run(ctx, input) {
    if (!input.dueAt && input.inDays === undefined) throw new ToolError("invalid_input", "Give dueAt or inDays.");
    const due = resolveDue({ dueAt: input.dueAt, inDays: input.inDays }, ctx.timezone);
    if (!due) throw new ToolError("invalid_input", "dueAt must be a date like 2026-11-03 or an ISO date-time.");
    if (due.getTime() < Date.now() - 86_400_000) throw new ToolError("invalid_input", "That date is in the past.", "Pick a future date.");
    const person = await resolvePersonId(ctx, input);
    const reminder = await createReminder(ctx.ownerId, parseOrThrow(reminderInput, { personId: person.id, dueAt: due.toISOString(), message: input.message, recurrence: input.recurrence }));
    if (!reminder) throw new ToolError("not_found", "That person no longer exists.");
    return { ok: true, followUpId: reminder.id, person: person.name, personId: person.id, due: day(reminder.dueAt, ctx.timezone), recurrence: reminder.recurrence };
  },
  audit: (r) => ({ entity: "reminder", entityId: r.followUpId }),
});

export const completeFollowupOp = defineOp({
  name: "complete_followup",
  title: "Complete follow-up",
  description: "Mark a follow-up as done (ids come from due_followups or get_person). Recurring follow-ups roll forward to their next date instead of closing.",
  access: "write",
  input: z.object({ followUpId: z.string().uuid() }),
  async run(ctx, input) {
    const r = await completeReminder(ctx.ownerId, input.followUpId);
    if (!r) throw new ToolError("not_found", "No follow-up with that id.", "Use due_followups to list open follow-ups.");
    return { ok: true, followUpId: r.id, person: r.person.displayName, status: r.status, ...(r.status === "pending" ? { nextDue: day(r.dueAt, ctx.timezone) } : {}) };
  },
  audit: (r) => ({ entity: "reminder", entityId: r.followUpId }),
});

export const WRITE_OPS = [addNoteOp, createPersonOp, updatePersonOp, createFollowupOp, completeFollowupOp] as const;
