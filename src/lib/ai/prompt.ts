import type { SystemModelMessage } from "ai";
import { CACHE_BREAKPOINT } from "./provider";

/**
 * The assistant's system prompt, in three parts ordered for prompt caching (render order is
 * tools → system → messages, and a cache hit needs an identical prefix):
 *
 *   1. RULES        static, identical for every owner and request      → cache breakpoint 1
 *   2. CONTEXT      taxonomy + compact people index (changes on edits) → cache breakpoint 2
 *   3. TAIL         date, zone, home city, page context (per day/thread; no breakpoint)
 *
 * The chat route adds breakpoint 3 on the newest message so a multi-step tool loop and the next
 * turn reuse the whole conversation prefix. Nothing personal is hard-coded: names and places
 * come from the owner's profile.
 */

export const RULES = `You are The Network's assistant: a private relationship manager for one person (the user). You can read and update their database of people, notes (meetings, calls, messages), follow-up reminders, categories, activities and tags through tools.

How to work
- Answer small talk and general questions directly, without tools.
- Use tools whenever the answer depends on the user's network data. Never guess facts about people; if the data doesn't say, say so.
- The PEOPLE INDEX below lists everyone (id|name|city|categories|tags). Resolve names from it and call tools with the id directly — don't run search_people just to find someone listed there. If a name matches several people, ask which one.
- "What did we discuss / talk about last time with X?" → list_notes for that person (limit 3, full: true when the user wants detail).
- Activities, places and categories ("who can I go hiking with in <city>", "mentors in <city>") → search_people with filters (activities, city, categories …). For "near", "around" or travel → people_by_place.
- Topics across notes ("who mentioned climbing", "where did I write about the fundraise") → search_notes. Notes mix Slovenian and English: always include both language variants of key terms joined with OR.
- Follow-ups → due_followups. For "who should I reach out to", combine due follow-ups with important people not contacted recently (search_people with lastContactBefore).
- Make independent tool calls in parallel. Stop calling tools once you can answer.

Writing
- Reply in the language the user writes in (often Slovenian or English).
- Be brief and concrete, like a sharp chief of staff. Lead with the answer. Use short bullet lists for several people; no tables unless asked.
- Mention people as markdown links: [Name](/people/<id>).
- Dates: say them naturally ("last Tuesday", "3 Oct"), not as ISO strings.

Changing data
- Only write (add_note, create_person, update_person, create_followup, complete_followup) when the user asks for it. If the person or details are ambiguous, ask one short question first; otherwise act, then confirm in one line what you did, with a link.
- Turn relative dates into concrete ones in the user's time zone ("in 3 months" → inDays: 90). Notes keep the user's own words and language.
- You cannot delete anything; point the user to the app for that.
- If a tool says the connection is read-only or a limit was reached, tell the user plainly.`;

export type PromptPerson = {
  id: string;
  name: string;
  city: string | null;
  categories: string[];
  tags: string[];
};

export type PromptInput = {
  ownerName: string | null;
  timezone: string;
  homeCity: string | null;
  categories: string[];
  activities: { name: string; emoji: string | null }[];
  tags: string[];
  people: PromptPerson[];
  /** When the chat was opened from a person's page. */
  focus?: { id: string; name: string } | null;
  now?: Date;
};

/** Most people the index carries (most recently in touch first; the route passes them in that order). */
export const MAX_INDEX_PEOPLE = 800;

/** Keeps index cells on one line and free of the column separator. */
const cell = (s: string | null | undefined) => (s ?? "").replace(/[|\s]+/g, " ").trim();

/** One line per person: id|name|city|categories|tags. Sorted by name so recency changes don't break the cache. */
export function peopleIndex(people: PromptPerson[]): string {
  return people
    .slice(0, MAX_INDEX_PEOPLE)
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .map((p) => [p.id, cell(p.name), cell(p.city), p.categories.map(cell).join(","), p.tags.map(cell).join(",")].join("|"))
    .join("\n");
}

export function contextBlock(input: Pick<PromptInput, "categories" | "activities" | "tags" | "people">): string {
  const activities = input.activities.map((a) => (a.emoji ? `${a.emoji} ${a.name}` : a.name));
  const omitted = Math.max(0, input.people.length - MAX_INDEX_PEOPLE);
  return [
    "TAXONOMY",
    `Categories: ${input.categories.join(", ") || "(none)"}`,
    `Activities: ${activities.join(", ") || "(none)"}`,
    `Tags: ${input.tags.join(", ") || "(none)"}`,
    "Warmth: inner (closest), active, dormant, archive. Circles: nice_to_know, hang_out_more, potential_close.",
    "",
    `PEOPLE INDEX (${Math.min(input.people.length, MAX_INDEX_PEOPLE)} people${omitted ? `; ${omitted} less recent people omitted — use search_people for them` : ""})`,
    "id|name|city|categories|tags",
    peopleIndex(input.people) || "(nobody yet)",
  ].join("\n");
}

export function tailBlock(input: Pick<PromptInput, "ownerName" | "timezone" | "homeCity" | "focus" | "now">): string {
  const now = input.now ?? new Date();
  let today: string;
  try {
    today = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: input.timezone }).format(now);
  } catch {
    today = now.toDateString();
  }
  const lines = [
    `Today is ${today}; the user's time zone is ${input.timezone}.`,
    input.ownerName ? `The user's name is ${input.ownerName}.` : null,
    input.homeCity ? `Their home base is ${input.homeCity}.` : null,
    input.focus
      ? `The user opened this chat from the page of ${input.focus.name} (id ${input.focus.id}). Unless they say otherwise, questions are about this person.`
      : null,
  ];
  return lines.filter(Boolean).join("\n");
}

/** The system messages, with cache breakpoints on the static rules and on the context block. */
export function buildSystem(input: PromptInput): SystemModelMessage[] {
  return [
    { role: "system", content: RULES, providerOptions: CACHE_BREAKPOINT as SystemModelMessage["providerOptions"] },
    { role: "system", content: contextBlock(input), providerOptions: CACHE_BREAKPOINT as SystemModelMessage["providerOptions"] },
    { role: "system", content: tailBlock(input) },
  ];
}
