/**
 * Commit approved import proposals into The Network, and roll commits back.
 *
 * Phase 1 — one savepoint per approved person: target = merged_into chain → match_person_id →
 *   existing person with source_ref 'import-person:<id>' → create. FILL BLANKS ONLY on existing
 *   people; arrays unioned; categories by slug; activities/tags find-or-create; one pinned
 *   "From Apple Notes — key facts" note per person (key facts + open threads); at most one imported
 *   reminder per person. A target person the user deleted is skipped, never recreated.
 * Phase 2 — one savepoint per note: the verbatim note filed under its primary person (or excerpt
 *   notes for list/journal notes), note_mentions for the other committed people, item → committed.
 *   A note the user deleted stays deleted; one they edited in the app keeps their version.
 * Phase 3 — introducedBy links between all committed people (across commits, merge chains followed).
 * Every insert/update is written to import_commit_log (with the previous values) so a commit can
 * be rolled back exactly. A dry run executes everything in one transaction and rolls it back.
 */
import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, isNotNull, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { schema } from "@/lib/db";
import { activities, importCommitLog, importItemsX, importMentions, importPeople, personActivities, remindersX, type ImportPerson } from "@/lib/db/schema-import";
import { HOBBIES, type Warmth } from "@/lib/constants";
import { htmlToMarkdown } from "@/lib/html-to-md";
import { fromIsoDay, noteDate } from "@/lib/import/dates";
import { createGeocoder, type CityHit, type Geocoder } from "@/lib/import/geo";
import { normalizeExtraction } from "@/lib/import/mentions";
import { readProfile } from "@/lib/import/profile";
import { introductionLinks } from "@/lib/import/introductions";
import { openThreadsMarkdown, planReminders, SPREAD_DAYS, type OpenThread, type PersonPlan } from "@/lib/import/reminders-policy";
import { rollbackBlockers, type BlockerRef } from "@/lib/import/rollback-guard";
import { finalProposalResolver } from "./import-resolve";
import { eachLimit } from "@/lib/each-limit";
import { ImportError, inTransaction, type DbOrTx, type Tx } from "./import-shared";

const { people, notes, noteMentions, personCategories, categories, tags, personTags, locations } = schema;

export const SOURCE_KIND = "apple-notes";
export const FACTS_TITLE = "From Apple Notes — key facts";
export const personSourceRef = (proposalId: string) => `import-person:${proposalId}`;
export const factsSourceRef = (key: string) => `apple-notes:facts:${key}`;

/**
 * Where rows written by a commit say they came from. Apple Notes keeps its historical values; other
 * sources (e.g. "paste" from the quick import) use the source name, and — because every paste makes
 * fresh proposal keys — key their facts note by the target person, so repeated pastes about the same
 * person extend one pinned note instead of stacking new ones. Facts notes are also found per person
 * by `factsPrefix`, so two proposals approved into one person share a single facts note.
 * `oneReminderEver`: Apple Notes adds at most one imported reminder per person, ever; pastes may add a
 * new one once the person's earlier imported reminder is done.
 */
export function sourceMeta(source: string) {
  if (source === SOURCE_KIND) {
    return { kind: SOURCE_KIND, factsTitle: FACTS_TITLE, factsPrefix: factsSourceRef(""), factsRef: (key: string, _personId: string) => factsSourceRef(key), oneReminderEver: true };
  }
  return { kind: source, factsTitle: "Key facts", factsPrefix: `${source}:facts:`, factsRef: (_key: string, personId: string) => `${source}:facts:${personId}`, oneReminderEver: false };
}
export const excerptSourceRef = (externalId: string, key: string) => `${externalId}#${key}`;

const DAY = 86_400_000;
const OPEN_REMINDER = ["pending", "sent", "snoozed"] as const;
type StoredNames = { firstName?: string | null; lastName?: string | null };

/* ------------------------------------------------------------------ */
/*  Commit log                                                         */
/* ------------------------------------------------------------------ */

const LOGGED_TABLES = ["people", "notes", "note_mentions", "reminders", "person_categories", "tags", "person_tags", "activities", "person_activities", "locations", "import_people", "import_items"] as const;
type LoggedTable = (typeof LOGGED_TABLES)[number];

class CommitLog {
  counts: Record<string, number> = {};
  constructor(
    private tx: Tx,
    private meta: { ownerId: string; commitId: string; source: string },
  ) {}
  /** A log bound to a savepoint; merge its counts with absorb() once the savepoint succeeded. */
  with(tx: Tx) {
    return new CommitLog(tx, this.meta);
  }
  absorb(child: CommitLog) {
    for (const [k, v] of Object.entries(child.counts)) this.counts[k] = (this.counts[k] ?? 0) + v;
  }
  private async write(op: "insert" | "update", table: LoggedTable, rowKey: Record<string, string>, before: Record<string, unknown> | null, ctx: { personId?: string | null; itemId?: string | null }) {
    this.counts[`${table}:${op}`] = (this.counts[`${table}:${op}`] ?? 0) + 1;
    await this.tx.insert(importCommitLog).values({ ...this.meta, importPersonId: ctx.personId ?? null, itemId: ctx.itemId ?? null, tableName: table, rowKey, op, before });
  }
  insert(table: LoggedTable, rowKey: Record<string, string>, ctx: { personId?: string | null; itemId?: string | null } = {}) {
    return this.write("insert", table, rowKey, null, ctx);
  }
  update(table: LoggedTable, rowKey: Record<string, string>, before: Record<string, unknown>, ctx: { personId?: string | null; itemId?: string | null } = {}) {
    return this.write("update", table, rowKey, before, ctx);
  }
}

/** Current DB values (JSON as Postgres renders them, so jsonb_populate_record restores them exactly). */
async function snapshot(tx: Tx, table: LoggedTable, id: string, cols: string[]): Promise<Record<string, unknown>> {
  const rows = (await tx.execute(sql`select to_jsonb(t) as row from ${sql.identifier(table)} t where t.id = ${id}`)) as unknown as { row: Record<string, unknown> }[];
  const row = rows[0]?.row ?? {};
  return Object.fromEntries(cols.map((c) => [c, row[c] ?? null]));
}

const toSnake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** Updates only the given columns, logging their previous values. No-op when nothing changes. */
async function loggedUpdate(tx: Tx, log: CommitLog, table: "people" | "notes" | "import_people" | "import_items", id: string, patch: Record<string, unknown>, ctx: { personId?: string | null; itemId?: string | null }) {
  const keys = Object.keys(patch).filter((k) => patch[k] !== undefined);
  if (!keys.length) return false;
  const before = await snapshot(tx, table, id, keys.map(toSnake));
  const t = table === "people" ? people : table === "notes" ? notes : table === "import_people" ? importPeople : importItemsX;
  await tx.update(t).set(Object.fromEntries(keys.map((k) => [k, patch[k]]))).where(eq(t.id, id));
  await log.update(table, { id }, before, ctx);
  return true;
}

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

type Ctx = {
  ownerId: string;
  source: string;
  commitId: string;
  now: Date;
  geo: Geocoder;
  categoryIds: Map<string, string>;
  hasActivities: boolean;
  itemDates: Map<string, { date: Date; title: string | null }>;
  plans: Map<string, PersonPlan>;
  warnings: string[];
  meta: ReturnType<typeof sourceMeta>;
  /** Imported notes the user changed in the app since the import last wrote them: never overwritten. */
  editedNotes: Set<string>;
  /** People the user deleted: no notes are filed under them and they are never recreated. */
  deletedPeople: Set<string>;
};

async function tableExists(tx: Tx, name: string) {
  const r = (await tx.execute(sql`select to_regclass(${name}) is not null as ok`)) as unknown as { ok: boolean }[];
  return !!r[0]?.ok;
}

/**
 * Imported notes edited in the app since the import last wrote them: the editor saved content_json
 * (the import never does), or updated_at is later than the newest logged import write of the note.
 * Notes from before the commit log count their creation as that write. (A rolled-back update also
 * bumps updated_at, so such a note counts as edited: the safe side.)
 */
async function loadEditedNotes(tx: Tx, ownerId: string, kind: string) {
  const rows = (await tx.execute(sql`
    select n.id from notes n
    left join (
      select row_key->>'id' as id, max(created_at) as at from import_commit_log
      where owner_id = ${ownerId} and table_name = 'notes' group by 1
    ) w on w.id = n.id::text
    where n.owner_id = ${ownerId} and n.source_kind = ${kind} and n.deleted_at is null
      and (n.content_json is not null or n.updated_at > coalesce(w.at, n.created_at))`)) as unknown as { id: string }[];
  return new Set(rows.map((r) => r.id));
}

async function loadDeletedPeople(tx: Tx, ownerId: string) {
  const rows = await tx.select({ id: people.id }).from(people).where(and(eq(people.ownerId, ownerId), isNotNull(people.deletedAt)));
  return new Set(rows.map((r) => r.id));
}

/**
 * Reminder state before planning: due dates of pending imported reminders (they count toward the
 * ≤3/day spread, so chunked and repeated commits don't pile up on one day) and which proposals
 * already have an imported reminder (by their key, or on their known target person).
 */
async function reminderState(tx: Tx, ownerId: string, meta: ReturnType<typeof sourceMeta>, toCommit: ImportPerson[], now: Date) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const taken = await tx
    .select({ dueAt: remindersX.dueAt })
    .from(remindersX)
    .where(and(eq(remindersX.ownerId, ownerId), eq(remindersX.sourceKind, meta.kind), inArray(remindersX.status, OPEN_REMINDER), gte(remindersX.dueAt, new Date(today + DAY)), lt(remindersX.dueAt, new Date(today + (SPREAD_DAYS + 1) * DAY))));
  const keys = toCommit.map((p) => p.key);
  const targets = [...new Set(toCommit.flatMap((p) => [p.committedPersonId, p.matchPersonId]).filter((x): x is string => !!x))];
  const have = keys.length
    ? await tx
        .select({ ref: remindersX.sourceRef, personId: remindersX.personId, status: remindersX.status })
        .from(remindersX)
        .where(and(eq(remindersX.ownerId, ownerId), eq(remindersX.sourceKind, meta.kind), or(inArray(remindersX.sourceRef, keys), targets.length ? inArray(remindersX.personId, targets) : undefined)))
    : [];
  const refs = new Set(have.map((r) => r.ref));
  const persons = new Set(have.filter((r) => meta.oneReminderEver || (OPEN_REMINDER as readonly string[]).includes(r.status)).map((r) => r.personId));
  return {
    taken: taken.map((r) => r.dueAt),
    has: (p: ImportPerson) => refs.has(p.key) || [p.committedPersonId, p.matchPersonId].some((id) => !!id && persons.has(id)),
  };
}

function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function warmthByRecency(lastSeen: Date | null, now: Date): Warmth {
  if (!lastSeen) return "dormant";
  const age = now.getTime() - lastSeen.getTime();
  if (age <= 183 * DAY) return "active";
  if (age <= 730 * DAY) return "dormant";
  return "archive";
}

function linkFields(links: string[]) {
  const find = (re: RegExp) => links.find((l) => re.test(l)) ?? null;
  return {
    linkedin: find(/linkedin\.com/i),
    xHandle: find(/(^@\w+$)|x\.com|twitter\.com/i),
    instagram: find(/instagram\.com/i),
    website: links.find((l) => /^https?:\/\//i.test(l) && !/linkedin|x\.com|twitter|instagram/i.test(l)) ?? null,
  };
}

/* ------------------------------------------------------------------ */
/*  Phase 1: people                                                    */
/* ------------------------------------------------------------------ */

async function findOrCreateLocation(tx: Tx, ctx: Ctx, log: CommitLog, hit: CityHit | null, personId: string) {
  if (!hit) return null;
  const existing = await tx
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.ownerId, ctx.ownerId), eq(locations.cityId, hit.id)));
  if (existing[0]) return existing[0].id;
  const [row] = await tx
    .insert(locations)
    .values({ ownerId: ctx.ownerId, name: hit.name, admin: hit.admin, country: hit.country, countryCode: hit.countryCode, lat: hit.lat, lng: hit.lng, timezone: hit.timezone, cityId: hit.id, source: "cities" })
    .returning({ id: locations.id });
  await log.insert("locations", { id: row!.id }, { personId });
  return row!.id;
}

function factsMarkdown(facts: string[], threads: OpenThread[], extra: { howICanHelp?: string | null; whatICanAsk?: string | null }) {
  const parts: string[] = [];
  if (facts.length) parts.push(facts.map((f) => `- ${f}`).join("\n"));
  const ask = [extra.howICanHelp ? `**How I can help:** ${extra.howICanHelp}` : null, extra.whatICanAsk ? `**What I can ask:** ${extra.whatICanAsk}` : null].filter(Boolean);
  if (ask.length) parts.push(ask.join("\n\n"));
  const ot = openThreadsMarkdown(threads);
  if (ot) parts.push(ot);
  return parts.join("\n\n");
}

export const mdToText = (md: string) =>
  md
    .replace(/^#+\s*/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/_\((.+?)\)_/g, "($1)")
    .replace(/^- \[ \] /gm, "☐ ")
    .replace(/^- /gm, "• ");

/** Merges new markdown lines into an existing facts note without dropping anything already there. */
export function mergeFactsMd(existing: string, next: string) {
  const have = new Set(existing.split("\n").map((l) => l.trim()).filter(Boolean));
  const add = next.split("\n").filter((l) => l.trim() && !have.has(l.trim()) && !/^## /.test(l));
  return add.length ? `${existing.trimEnd()}\n${add.join("\n")}` : existing;
}

export type PersonResult = { proposalId: string; key: string; personId: string; action: "created" | "updated" | "unchanged"; reminder: boolean };
export type PersonSkip = { proposalId: string; key: string; action: "skipped"; name: string; reason: string };

type FactsInput = { personId: string; key: string; name: string; md: string; first: Date };

/**
 * One pinned facts note per person: found by this proposal's ref or by the person (prefix), so two
 * proposals approved into the same person share it. A facts note the user deleted stays deleted;
 * one they edited in the app is left alone (the editor shows content_json, so merging Markdown under
 * it would only desync search). Both cases become warnings.
 */
async function writeFactsNote(tx: Tx, ctx: Ctx, log: CommitLog, lc: { personId: string }, f: FactsInput) {
  const ref = ctx.meta.factsRef(f.key, f.personId);
  const rows = await tx
    .select({ id: notes.id, contentMd: notes.contentMd, deletedAt: notes.deletedAt, sourceRef: notes.sourceRef })
    .from(notes)
    .where(and(eq(notes.ownerId, ctx.ownerId), eq(notes.sourceKind, ctx.meta.kind), or(eq(notes.sourceRef, ref), and(eq(notes.personId, f.personId), sql`starts_with(${notes.sourceRef}, ${ctx.meta.factsPrefix})`))))
    .orderBy(notes.createdAt);
  const live = rows.find((r) => !r.deletedAt && r.sourceRef === ref) ?? rows.find((r) => !r.deletedAt);
  if (live) {
    const merged = mergeFactsMd(live.contentMd, f.md);
    if (merged === live.contentMd) return;
    if (ctx.editedNotes.has(live.id)) return void ctx.warnings.push(`${f.name}: you edited the key facts note in The Network — new facts not merged`);
    await loggedUpdate(tx, log, "notes", live.id, { contentMd: merged, contentText: mdToText(merged) }, lc);
    return;
  }
  if (rows.length) return void ctx.warnings.push(`${f.name}: you deleted the key facts note — not recreated`);
  const [n] = await tx
    .insert(notes)
    .values({ ownerId: ctx.ownerId, personId: f.personId, title: ctx.meta.factsTitle, contentMd: f.md, contentText: mdToText(f.md), kind: "note", occurredAt: f.first, pinned: true, sourceKind: ctx.meta.kind, sourceRef: ref })
    .returning({ id: notes.id });
  await log.insert("notes", { id: n!.id }, lc);
}

/**
 * At most one imported reminder per person: this proposal already made one (any status — re-runs
 * never repeat it), or the person has one from this source (any status for Apple Notes, open ones for
 * sources that keep adding follow-ups such as pastes). Covers two proposals resolving to one person.
 */
async function hasImportedReminder(tx: Tx, ctx: Ctx, personId: string, key: string) {
  const [r] = await tx
    .select({ id: remindersX.id })
    .from(remindersX)
    .where(
      and(
        eq(remindersX.ownerId, ctx.ownerId),
        eq(remindersX.sourceKind, ctx.meta.kind),
        or(eq(remindersX.sourceRef, key), and(eq(remindersX.personId, personId), ctx.meta.oneReminderEver ? undefined : inArray(remindersX.status, OPEN_REMINDER))),
      ),
    )
    .limit(1);
  return !!r;
}

async function commitPerson(tx: Tx, ctx: Ctx, log: CommitLog, p: ImportPerson): Promise<PersonResult | PersonSkip> {
  // Lock the proposal; a concurrent commit of the same person waits here.
  const [locked] = await tx.select().from(importPeople).where(eq(importPeople.id, p.id)).for("update");
  if (!locked || locked.status !== "approved") throw new Error(`proposal ${p.key} is ${locked?.status ?? "gone"}`);
  const prof = readProfile(locked.profile);
  const names = locked.profile as StoredNames;
  const lc = { personId: locked.id };
  const skip = (name: string): PersonSkip => ({ proposalId: locked.id, key: locked.key, action: "skipped", name, reason: `${name} was deleted in The Network — restore them there to import more` });

  // Target person. One the user deleted is respected: skipped, never recreated as a duplicate. The
  // row lock serialises concurrent commits of two proposals for one person (one facts note, one reminder).
  let personId: string | null = null;
  for (const candidate of [locked.committedPersonId, locked.matchPersonId]) {
    if (!candidate) continue;
    const [r] = await tx
      .select({ id: people.id, displayName: people.displayName, deletedAt: people.deletedAt })
      .from(people)
      .where(and(eq(people.id, candidate), eq(people.ownerId, ctx.ownerId)))
      .for("update");
    if (!r) continue;
    if (r.deletedAt) return skip(r.displayName);
    personId = r.id;
    break;
  }
  if (!personId) {
    const rows = await tx
      .select({ id: people.id, displayName: people.displayName, deletedAt: people.deletedAt })
      .from(people)
      .where(and(eq(people.ownerId, ctx.ownerId), eq(people.sourceRef, personSourceRef(locked.id))));
    const live = rows.find((r) => !r.deletedAt);
    if (!live && rows[0]) return skip(rows[0].displayName);
    personId = live?.id ?? null;
  }

  const home = await findOrCreateLocation(tx, ctx, log, await ctx.geo(prof.city, prof.country), locked.id);
  const met = await findOrCreateLocation(tx, ctx, log, await ctx.geo(prof.metCity, null), locked.id);
  const links = linkFields(prof.links);
  const metAt = prof.metDate && /^\d{4}-\d{2}-\d{2}$/.test(prof.metDate) ? prof.metDate : null;
  const metContext = prof.metContext && prof.metDate && !metAt ? `${prof.metContext} (${prof.metDate})` : prof.metContext;
  const lastSeen = fromIsoDay(prof.lastSeen);
  const legacyHobbies = ctx.hasActivities ? [] : prof.activities.map((a) => slugify(a)).filter((a): a is (typeof HOBBIES)[number] => (HOBBIES as readonly string[]).includes(a));

  let action: PersonResult["action"] = "unchanged";
  if (!personId) {
    const [row] = await tx
      .insert(people)
      .values({
        ownerId: ctx.ownerId,
        displayName: locked.displayName,
        firstName: names.firstName ?? null,
        lastName: names.lastName ?? null,
        headline: prof.role,
        company: prof.company,
        homeLocationId: home,
        metContext,
        metAt,
        metLocationId: met,
        warmth: prof.warmth ?? warmthByRecency(lastSeen, ctx.now),
        circle: prof.circle,
        hobbies: legacyHobbies,
        howICanHelp: prof.howICanHelp,
        whatICanAsk: prof.whatICanAsk,
        ...links,
        sourceKind: ctx.meta.kind,
        sourceRef: personSourceRef(locked.id),
      })
      .returning({ id: people.id });
    personId = row!.id;
    await log.insert("people", { id: personId }, lc);
    action = "created";
  } else {
    const [cur] = await tx.select().from(people).where(eq(people.id, personId));
    const blank = (v: unknown) => v == null || v === "";
    const patch: Record<string, unknown> = {};
    const fill = (col: keyof typeof cur, value: unknown) => {
      if (value != null && value !== "" && blank(cur![col])) patch[col] = value;
    };
    fill("firstName", names.firstName);
    fill("lastName", names.lastName);
    fill("headline", prof.role);
    fill("company", prof.company);
    fill("homeLocationId", home);
    fill("metContext", metContext);
    fill("metAt", metAt);
    fill("metLocationId", met);
    fill("circle", prof.circle);
    fill("howICanHelp", prof.howICanHelp);
    fill("whatICanAsk", prof.whatICanAsk);
    for (const [k, v] of Object.entries(links)) fill(k as keyof typeof cur, v);
    const hob = [...new Set([...cur!.hobbies, ...legacyHobbies])];
    if (hob.length !== cur!.hobbies.length) patch.hobbies = hob;
    if (await loggedUpdate(tx, log, "people", personId, patch, lc)) action = "updated";
  }

  // Categories (by slug).
  for (const slug of prof.categories) {
    const cid = ctx.categoryIds.get(slug);
    if (!cid) continue;
    const ins = await tx.insert(personCategories).values({ ownerId: ctx.ownerId, personId, categoryId: cid }).onConflictDoNothing().returning({ p: personCategories.personId });
    if (ins.length) await log.insert("person_categories", { person_id: personId, category_id: cid }, lc);
  }

  // Activities (find-or-create by slug).
  if (ctx.hasActivities) {
    for (const a of prof.activities) {
      const slug = slugify(a);
      if (!slug) continue;
      let aid = (await tx.select({ id: activities.id }).from(activities).where(and(eq(activities.ownerId, ctx.ownerId), eq(activities.slug, slug))))[0]?.id;
      if (!aid) {
        const name = a.trim().charAt(0).toUpperCase() + a.trim().slice(1).toLowerCase();
        [{ id: aid }] = await tx.insert(activities).values({ ownerId: ctx.ownerId, name, slug }).returning({ id: activities.id });
        await log.insert("activities", { id: aid! }, lc);
      }
      const ins = await tx.insert(personActivities).values({ ownerId: ctx.ownerId, personId, activityId: aid! }).onConflictDoNothing().returning({ p: personActivities.personId });
      if (ins.length) await log.insert("person_activities", { person_id: personId, activity_id: aid! }, lc);
    }
  }

  // Tags (case-insensitive find-or-create).
  for (const t of prof.tags) {
    const name = t.trim();
    if (!name) continue;
    let tid = (await tx.select({ id: tags.id }).from(tags).where(and(eq(tags.ownerId, ctx.ownerId), sql`lower(${tags.name}) = lower(${name})`)))[0]?.id;
    if (!tid) {
      [{ id: tid }] = await tx.insert(tags).values({ ownerId: ctx.ownerId, name }).returning({ id: tags.id });
      await log.insert("tags", { id: tid! }, lc);
    }
    const ins = await tx.insert(personTags).values({ ownerId: ctx.ownerId, personId, tagId: tid! }).onConflictDoNothing().returning({ p: personTags.personId });
    if (ins.length) await log.insert("person_tags", { person_id: personId, tag_id: tid! }, lc);
  }

  // At most one imported reminder per person; one that can't be created joins the open threads.
  const plan = ctx.plans.get(locked.key) ?? { reminder: null, openThreads: [] };
  let reminder = plan.reminder;
  let threads = plan.openThreads;
  if (reminder && (await hasImportedReminder(tx, ctx, personId, locked.key))) {
    threads = [...threads, ...reminder.threads];
    reminder = null;
  }

  // Key facts + open threads → the person's pinned facts note.
  const md = factsMarkdown(prof.keyFacts, threads, { howICanHelp: prof.howICanHelp, whatICanAsk: prof.whatICanAsk });
  if (md) await writeFactsNote(tx, ctx, log, lc, { personId, key: locked.key, name: locked.displayName, md, first: fromIsoDay(prof.firstSeen) ?? fromIsoDay(prof.lastSeen) ?? ctx.now });

  if (reminder) {
    const [r] = await tx
      .insert(remindersX)
      .values({ ownerId: ctx.ownerId, personId, dueAt: reminder.dueAt, message: reminder.message, recurrence: "none", sourceKind: ctx.meta.kind, sourceRef: locked.key })
      .returning({ id: remindersX.id });
    await log.insert("reminders", { id: r!.id }, lc);
    await syncNextFollowup(tx, personId);
  }

  await loggedUpdate(tx, log, "import_people", locked.id, { status: "committed", committedPersonId: personId }, lc);
  return { proposalId: locked.id, key: locked.key, personId, action, reminder: !!reminder };
}

async function syncNextFollowup(tx: Tx, personId: string) {
  await tx.execute(sql`
    update people set next_followup_at = (
      select min(due_at) from reminders where person_id = ${personId} and status in ('pending', 'sent', 'snoozed')
    ) where id = ${personId}`);
}

/**
 * Phase 3: introducedBy between every committed proposal and its introducer, wherever either was
 * committed (chunked or resumable commits put them in different runs) and through merge chains.
 * Fills blanks only, skips deleted people, and never re-sets a link an earlier commit made that the
 * user cleared since.
 */
async function linkIntroductions(db: Tx, ctx: Ctx, log: CommitLog, props: ImportPerson[]) {
  const links = introductionLinks(props.map((p) => ({ id: p.id, key: p.key, status: p.status, mergedIntoId: p.mergedIntoId, committedPersonId: p.committedPersonId, introducedByKey: readProfile(p.profile).introducedByKey })));
  if (!links.length) return 0;
  const ids = [...new Set(links.flatMap((l) => [l.personId, l.introducerId]))];
  const rows = await db
    .select({ id: people.id, introducedById: people.introducedById, deletedAt: people.deletedAt })
    .from(people)
    .where(and(eq(people.ownerId, ctx.ownerId), inArray(people.id, ids)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const cleared = new Set(
    (
      (await db.execute(sql`
        select distinct row_key->>'id' as id from import_commit_log
        where owner_id = ${ctx.ownerId} and table_name = 'people' and op = 'update' and before -> 'introduced_by_id' is not null`)) as unknown as { id: string }[]
    ).map((r) => r.id),
  );
  let n = 0;
  for (const l of links) {
    const person = byId.get(l.personId);
    const intro = byId.get(l.introducerId);
    if (!person || !intro || person.deletedAt || intro.deletedAt || person.introducedById || cleared.has(l.personId)) continue;
    await loggedUpdate(db, log, "people", l.personId, { introducedById: l.introducerId }, { personId: l.proposalId });
    n++;
  }
  return n;
}

/* ------------------------------------------------------------------ */
/*  Phase 2: notes                                                     */
/* ------------------------------------------------------------------ */

type NoteItem = {
  id: string;
  externalId: string;
  title: string | null;
  html: string | null;
  text: string;
  status: string;
  classification: string | null;
  noteId: string | null;
  externalCreatedAt: Date | null;
  candidates: unknown;
  extractionVersion: number | null;
};

/**
 * `kept`: the note was left alone for the user — they deleted it (or the person it belongs to), or
 * edited it in the app since the import wrote it. `deleted` / `edited` count those notes (excerpt
 * notes included).
 */
export type NoteResult = {
  itemId: string;
  action: "created" | "updated" | "unchanged" | "excerpts" | "waiting" | "kept";
  noteId: string | null;
  excerpts: number;
  mentions: number;
  deleted: number;
  edited: number;
  waitingOn: string[];
};

async function commitNote(tx: Tx, ctx: Ctx, log: CommitLog, it: NoteItem, props: ImportPerson[]): Promise<NoteResult> {
  const final = finalProposalResolver(props);
  const ms = await tx.select().from(importMentions).where(eq(importMentions.itemId, it.id));
  const res: NoteResult = { itemId: it.id, action: "unchanged", noteId: it.noteId, excerpts: 0, mentions: 0, deleted: 0, edited: 0, waitingOn: [] };
  const lc = { itemId: it.id };
  const label = `“${it.title ?? "Note"}”`;
  const nd = ctx.itemDates.get(it.id)?.date ?? it.externalCreatedAt ?? ctx.now;
  const resolved = ms.map((m) => ({ m, p: final(m.importPersonId) }));
  const fileable = resolved.filter((r) => r.p && r.p.disposition === "person" && r.p.status !== "rejected");
  const committedId = (p: ImportPerson | null) => (p?.status === "committed" ? p.committedPersonId : null);

  const primary = resolved.find((r) => r.m.role === "primary");
  const excerptRoles = resolved.filter((r) => r.m.role === "listed" || r.m.role === "excerpt");

  if (primary) {
    const pid = committedId(primary.p);
    if (!pid) {
      res.action = "waiting";
      res.waitingOn.push(primary.p?.key ?? primary.m.surface);
      return res;
    }
    if (ctx.deletedPeople.has(pid)) {
      res.action = "kept";
      res.deleted++;
      ctx.warnings.push(`${label}: ${primary.p!.displayName} was deleted in The Network — note not filed`);
      return res;
    }
    const content = { title: it.title, contentMd: it.html ? htmlToMarkdown(it.html) : it.text, contentText: it.text, occurredAt: nd };
    let noteId: string | null = null;
    // Existing note: recorded on the item, or found by source ref (re-run after a partial commit).
    // Deleted ones count too: a note the user deleted stays deleted.
    const found = await tx
      .select({ id: notes.id, deletedAt: notes.deletedAt, title: notes.title, contentText: notes.contentText })
      .from(notes)
      .where(and(eq(notes.ownerId, ctx.ownerId), or(it.noteId ? eq(notes.id, it.noteId) : undefined, and(eq(notes.sourceKind, ctx.meta.kind), eq(notes.sourceRef, it.externalId)))));
    const cur = found.find((n) => n.id === it.noteId && !n.deletedAt) ?? found.find((n) => !n.deletedAt);
    if (!cur && found.length) {
      const gone = found.find((n) => n.id === it.noteId) ?? found[0]!;
      res.action = "kept";
      res.deleted++;
      res.noteId = gone.id;
      await loggedUpdate(tx, log, "import_items", it.id, { status: it.status !== "committed" ? "committed" : undefined, noteId: it.noteId !== gone.id ? gone.id : undefined }, lc);
      return res;
    }
    if (cur) {
      noteId = cur.id;
      if (cur.contentText !== it.text || cur.title !== it.title) {
        if (ctx.editedNotes.has(cur.id)) {
          res.action = "kept";
          res.edited++;
          ctx.warnings.push(`${label}: you edited it in The Network — kept your version`);
        } else {
          await loggedUpdate(tx, log, "notes", noteId, content, lc);
          res.action = "updated";
        }
      }
    } else {
      const [n] = await tx
        .insert(notes)
        .values({
          ownerId: ctx.ownerId,
          personId: pid,
          ...content,
          kind: it.classification === "meeting" ? "meeting" : "note",
          pinned: false,
          sourceKind: ctx.meta.kind,
          sourceRef: it.externalId,
        })
        .onConflictDoNothing()
        .returning({ id: notes.id });
      if (!n) throw new Error(`note for ${it.externalId} conflicts with an existing live note`);
      noteId = n.id;
      await log.insert("notes", { id: noteId }, lc);
      res.action = "created";
    }
    res.noteId = noteId;
    // Everyone else in the note who is committed (and not deleted) → mention.
    const others = new Set(fileable.map((r) => committedId(r.p)).filter((x): x is string => !!x && x !== pid && !ctx.deletedPeople.has(x)));
    for (const other of others) {
      const ins = await tx.insert(noteMentions).values({ ownerId: ctx.ownerId, noteId, personId: other }).onConflictDoNothing().returning({ n: noteMentions.noteId });
      if (ins.length) {
        await log.insert("note_mentions", { note_id: noteId, person_id: other }, lc);
        res.mentions++;
      }
    }
    for (const r of fileable) if (!committedId(r.p) && r.p!.status !== "rejected") res.waitingOn.push(r.p!.key);
    const patch: Record<string, unknown> = {};
    if (it.status !== "committed") patch.status = "committed";
    if (it.noteId !== noteId) patch.noteId = noteId;
    await loggedUpdate(tx, log, "import_items", it.id, patch, lc);
    return res;
  }

  if (excerptRoles.length) {
    const ex = normalizeExtraction(it.candidates, it.extractionVersion);
    let waiting = 0;
    for (const r of excerptRoles) {
      if (!r.p || r.p.disposition !== "person" || r.p.status === "rejected") continue;
      const pid = committedId(r.p);
      if (!pid) {
        waiting++;
        res.waitingOn.push(r.p.key);
        continue;
      }
      if (ctx.deletedPeople.has(pid)) {
        res.deleted++;
        continue;
      }
      const excerpt = r.m.excerpt ?? ex.candidates.find((c) => c.index === r.m.candidateIndex)?.excerpt ?? null;
      if (!excerpt || !it.text.includes(excerpt)) {
        ctx.warnings.push(`no verbatim excerpt for ${r.p.key} in “${it.title}”`);
        continue;
      }
      // Same rules as whole notes: a deleted excerpt stays deleted, an edited one keeps the edit.
      const ref = excerptSourceRef(it.externalId, r.p.key);
      const found = await tx
        .select({ id: notes.id, contentText: notes.contentText, deletedAt: notes.deletedAt })
        .from(notes)
        .where(and(eq(notes.ownerId, ctx.ownerId), eq(notes.sourceKind, ctx.meta.kind), eq(notes.sourceRef, ref)));
      const have = found.find((n) => !n.deletedAt);
      if (have) {
        if (have.contentText === excerpt) continue;
        if (ctx.editedNotes.has(have.id)) {
          res.edited++;
          ctx.warnings.push(`${label} (excerpt for ${r.p.displayName}): you edited it in The Network — kept your version`);
        } else await loggedUpdate(tx, log, "notes", have.id, { contentMd: excerpt, contentText: excerpt, occurredAt: nd }, lc);
        continue;
      }
      if (found.length) {
        res.deleted++;
        continue;
      }
      const [n] = await tx
        .insert(notes)
        .values({ ownerId: ctx.ownerId, personId: pid, title: `${it.title ?? "Note"} (excerpt)`, contentMd: excerpt, contentText: excerpt, kind: "note", occurredAt: nd, pinned: false, sourceKind: ctx.meta.kind, sourceRef: ref })
        .returning({ id: notes.id });
      await log.insert("notes", { id: n!.id }, lc);
      res.excerpts++;
    }
    res.action = res.excerpts ? "excerpts" : waiting ? "waiting" : "unchanged";
    if (!waiting && it.status !== "committed") await loggedUpdate(tx, log, "import_items", it.id, { status: "committed" }, lc);
    return res;
  }
  res.action = "waiting";
  res.waitingOn.push("(not filed)");
  return res;
}

/* ------------------------------------------------------------------ */
/*  Orchestration                                                      */
/* ------------------------------------------------------------------ */

/** Drizzle wraps driver errors as "Failed query: <sql> params: …"; the Postgres reason is the cause. */
function failure(e: unknown): string {
  const err = e as Error & { cause?: { message?: string; code?: string; detail?: string } };
  const c = err.cause;
  return c?.message ? [c.message, c.code && `(${c.code})`, c.detail].filter(Boolean).join(" ") : err.message;
}

export type CommitReport = {
  commitId: string;
  dryRun: boolean;
  /** `skipped`: approved people whose person was deleted in The Network (never recreated). */
  people: { created: number; updated: number; unchanged: number; failed: { key: string; error: string }[]; skipped: { key: string; name: string; reason: string }[]; results: PersonResult[] };
  /** `deleted` / `edited`: notes left alone because the user deleted or edited them (see NoteResult). */
  notes: { created: number; updated: number; unchanged: number; excerpts: number; mentions: number; waiting: number; partial: number; deleted: number; edited: number; failed: { itemId: string; title: string | null; error: string }[] };
  introductions: number;
  reminders: number;
  log: Record<string, number>;
  warnings: string[];
};

/**
 * `keys` limits phase 1 to those proposals; `itemIds` limits phase 2 to those notes (the quick
 * import commits one pasted note without re-walking every earlier paste).
 */
export async function commitImport(
  db: DbOrTx,
  ownerId: string,
  opts: {
    source: string;
    dryRun: boolean;
    limit?: number;
    keys?: string[];
    itemIds?: string[];
    now?: Date;
    commitId?: string;
    /**
     * false (writes only): no outer transaction — every person and note commits on its own, so a
     * dropped connection loses one row's work and a re-run resumes (committed proposals and filed
     * notes are skipped). For long CLI runs through a pooler that recycles connections.
     */
    atomic?: boolean;
    /** Parallel workers for the per-person / per-note loops (each in its own transaction). */
    concurrency?: number;
    onProgress?: (phase: "people" | "notes", done: number, total: number) => void;
  },
): Promise<CommitReport> {
  const commitId = opts.commitId ?? randomUUID();
  const now = opts.now ?? new Date();
  // A dry run always needs the outer transaction: it is what rolls everything back.
  const atomic = opts.dryRun || opts.atomic !== false;
  const run = (body: (outer: Tx) => Promise<CommitReport>) => (atomic ? inTransaction(db, !opts.dryRun, body) : body(db as Tx));
  return run(async (outer) => {
    const report: CommitReport = {
      commitId,
      dryRun: opts.dryRun,
      people: { created: 0, updated: 0, unchanged: 0, failed: [], skipped: [], results: [] },
      notes: { created: 0, updated: 0, unchanged: 0, excerpts: 0, mentions: 0, waiting: 0, partial: 0, deleted: 0, edited: 0, failed: [] },
      introductions: 0,
      reminders: 0,
      log: {},
      warnings: [],
    };
    const log = new CommitLog(outer, { ownerId, commitId, source: opts.source });

    const cats = await outer.select({ id: categories.id, slug: categories.slug }).from(categories).where(eq(categories.ownerId, ownerId));
    const items = (await outer
      .select({
        id: importItemsX.id,
        externalId: importItemsX.externalId,
        title: importItemsX.title,
        html: importItemsX.html,
        text: importItemsX.text,
        status: importItemsX.status,
        classification: importItemsX.classification,
        noteId: importItemsX.noteId,
        externalCreatedAt: importItemsX.externalCreatedAt,
        candidates: importItemsX.candidates,
        extractionVersion: importItemsX.extractionVersion,
      })
      .from(importItemsX)
      .where(
        and(
          eq(importItemsX.ownerId, ownerId),
          eq(importItemsX.source, opts.source),
          isNull(importItemsX.goneAt),
          inArray(importItemsX.status, ["extracted", "committed"]),
          opts.itemIds ? inArray(importItemsX.id, opts.itemIds.length ? opts.itemIds : ["00000000-0000-0000-0000-000000000000"]) : undefined,
        ),
      )) as NoteItem[];
    const itemDates = new Map(
      items.map((it) => {
        const ex = normalizeExtraction(it.candidates, it.extractionVersion);
        return [it.id, { date: noteDate({ title: it.title, occurredAt: ex.occurredAt, created: it.externalCreatedAt }, now).date, title: it.title }];
      }),
    );

    let props = await outer.select().from(importPeople).where(and(eq(importPeople.ownerId, ownerId), eq(importPeople.source, opts.source)));
    let toCommit = props.filter((p) => p.status === "approved" && p.disposition === "person" && !p.mergedIntoId && (!opts.keys || opts.keys.includes(p.key)));
    toCommit.sort((a, b) => a.key.localeCompare(b.key));
    if (opts.limit != null) toCommit = toCommit.slice(0, opts.limit);

    // Reminder plan across everyone committed in this run; the ≤3/day spread also counts imported
    // reminders already pending (earlier chunks and commits).
    const rs = await reminderState(outer, ownerId, sourceMeta(opts.source), toCommit, now);
    const plans = planReminders(
      toCommit.map((p) => {
        const prof = readProfile(p.profile);
        return {
          key: p.key,
          createReminder: p.createReminder,
          hasReminder: rs.has(p),
          followUps: prof.followUps.map((f) => {
            const d = f.sourceItemId ? itemDates.get(f.sourceItemId) : undefined;
            const fallback = fromIsoDay(prof.lastSeen) ?? now;
            return { what: f.what, when: f.when, explicitDate: f.when && /^\d{4}-\d{2}-\d{2}$/.test(f.when) ? f.when : null, noteDate: d?.date ?? fallback, sourceItemId: f.sourceItemId, sourceTitle: d?.title ?? null };
          }),
        };
      }),
      now,
      { taken: rs.taken },
    );

    const ctx: Ctx = {
      ownerId,
      source: opts.source,
      commitId,
      now,
      geo: createGeocoder(async (q, lim) => {
        const rows = (await outer.execute(sql`select * from search_cities(${q}, ${lim})`)) as unknown as Record<string, unknown>[];
        return rows.map((r) => ({ id: Number(r.id), name: String(r.name), admin: (r.admin as string) ?? null, country: String(r.country), countryCode: String(r.country_code), lat: Number(r.lat), lng: Number(r.lng), timezone: (r.timezone as string) ?? null }));
      }),
      categoryIds: new Map(cats.map((c) => [c.slug, c.id])),
      hasActivities: (await tableExists(outer, "activities")) && (await tableExists(outer, "person_activities")),
      itemDates,
      plans,
      warnings: report.warnings,
      meta: sourceMeta(opts.source),
      editedNotes: await loadEditedNotes(outer, ownerId, sourceMeta(opts.source).kind),
      deletedPeople: await loadDeletedPeople(outer, ownerId),
    };
    if (!ctx.hasActivities) report.warnings.push("activities/person_activities tables not found — activities stored as legacy hobbies where they match");

    // Phase 1
    const workers = atomic ? 1 : Math.max(1, opts.concurrency ?? 1);
    await eachLimit(toCommit, workers, async (p) => {
      try {
        let child: CommitLog | null = null;
        const r = await outer.transaction(async (tx) => commitPerson(tx, ctx, (child = log.with(tx)), p));
        log.absorb(child!);
        if (r.action === "skipped") report.people.skipped.push({ key: r.key, name: r.name, reason: r.reason });
        else {
          report.people.results.push(r);
          report.people[r.action]++;
          if (r.reminder) report.reminders++;
        }
      } catch (e) {
        report.people.failed.push({ key: p.key, error: failure(e) });
      }
    }, (done) => opts.onProgress?.("people", done, toCommit.length));

    // Phase 2
    props = await outer.select().from(importPeople).where(and(eq(importPeople.ownerId, ownerId), eq(importPeople.source, opts.source)));
    const filed = new Set(
      (
        await outer
          .selectDistinct({ itemId: importMentions.itemId })
          .from(importMentions)
          .where(and(eq(importMentions.ownerId, ownerId), inArray(importMentions.role, ["primary", "listed", "excerpt"])))
      ).map((r) => r.itemId),
    );
    const toFile = items.filter((i) => filed.has(i.id));
    await eachLimit(toFile, workers, async (it) => {
      try {
        let child: CommitLog | null = null;
        const r = await outer.transaction(async (tx) => commitNote(tx, ctx, (child = log.with(tx)), it, props));
        log.absorb(child!);
        if (r.action === "created") report.notes.created++;
        else if (r.action === "updated") report.notes.updated++;
        else if (r.action === "waiting") report.notes.waiting++;
        else if (r.action === "unchanged") report.notes.unchanged++;
        if (r.action !== "waiting" && r.waitingOn.length) report.notes.partial++;
        report.notes.excerpts += r.excerpts;
        report.notes.mentions += r.mentions;
        report.notes.deleted += r.deleted;
        report.notes.edited += r.edited;
      } catch (e) {
        report.notes.failed.push({ itemId: it.id, title: it.title, error: failure(e) });
      }
    }, (done) => opts.onProgress?.("notes", done, toFile.length));

    // Phase 3: introducedBy among all committed people (fill blank only).
    report.introductions = await linkIntroductions(outer, ctx, log, props);
    report.log = log.counts;
    return report;
  });
}

/* ------------------------------------------------------------------ */
/*  Rollback                                                           */
/* ------------------------------------------------------------------ */

/** `kept`: shared rows (locations, tags, activities) the commit created that other data still uses. */
export type RollbackReport = { commits: string[]; reverted: Record<string, number>; kept: Record<string, number>; refused: string[]; peopleRecomputed: number; dryRun: boolean };

/**
 * Shared rows a commit may have created and the app or later commits reuse: deleting one still in
 * use would cascade away taggings / activities or unset people's home and met places. The log is
 * replayed newest first, so references the rolled-back commits made are already gone when asked.
 */
const SHARED_REFS: Partial<Record<LoggedTable, (id: string) => SQL>> = {
  locations: (id) => sql`select exists (select 1 from people where home_location_id = ${id}::uuid or met_location_id = ${id}::uuid) as used`,
  tags: (id) => sql`select exists (select 1 from person_tags where tag_id = ${id}::uuid) as used`,
  activities: (id) => sql`select exists (select 1 from person_activities where activity_id = ${id}::uuid) as used`,
};

/** Everything that references the given people (see rollbackBlockers). */
async function personRefs(tx: Tx, ids: string[]): Promise<BlockerRef[]> {
  const any = sql`any(${sql.param(ids)}::uuid[])`;
  const rows = (await tx.execute(sql`
    select 'note' as kind, person_id::text as person_id, id::text as other from notes where person_id = ${any} and deleted_at is null
    union all select 'reminder', person_id::text, id::text from reminders where person_id = ${any}
    union all select 'category', person_id::text, category_id::text from person_categories where person_id = ${any}
    union all select 'tag', person_id::text, tag_id::text from person_tags where person_id = ${any}
    union all select 'activity', person_id::text, activity_id::text from person_activities where person_id = ${any}
    union all select 'mention', person_id::text, note_id::text from note_mentions where person_id = ${any}
    union all select 'introduced', introduced_by_id::text, id::text from people where introduced_by_id = ${any}
    union all select 'chat', person_id::text, id::text from chat_threads where person_id = ${any}`)) as unknown as { kind: BlockerRef["kind"]; person_id: string; other: string }[];
  return rows.map((r) => ({ kind: r.kind, personId: r.person_id, other: r.other }));
}

/**
 * Reverts commits from the log, newest first, in one transaction. Refuses (unless `force`) to delete
 * people the user has built on since; keeps shared rows still in use. Updated columns go back to
 * their logged previous values even if the user changed them since: the log has no after-values.
 */
export async function rollbackImport(db: DbOrTx, ownerId: string, opts: { commitId?: string; source?: string; dryRun: boolean; force?: boolean }): Promise<RollbackReport> {
  if (!opts.commitId && !opts.source) throw new ImportError(422, "rollback needs a commit id or a source");
  return inTransaction(db, !opts.dryRun, async (tx) => {
    const rows = await tx
      .select()
      .from(importCommitLog)
      .where(and(eq(importCommitLog.ownerId, ownerId), opts.commitId ? eq(importCommitLog.commitId, opts.commitId) : eq(importCommitLog.source, opts.source!)))
      .orderBy(sql`${importCommitLog.id} desc`);
    const report: RollbackReport = { commits: [...new Set(rows.map((r) => r.commitId))], reverted: {}, kept: {}, refused: [], peopleRecomputed: 0, dryRun: opts.dryRun };
    if (!rows.length) return report;

    // Refuse to delete people the user has built on since (cascades would take their additions along).
    const insertedPeople = [...new Set(rows.filter((r) => r.tableName === "people" && r.op === "insert").map((r) => r.rowKey.id!))];
    if (insertedPeople.length) {
      const bad = rollbackBlockers(insertedPeople, rows, await personRefs(tx, insertedPeople));
      if (bad.size && !opts.force) {
        report.refused = [...bad.entries()].map(([pid, what]) => `person ${pid}: ${what.join(", ")}`);
        throw new ImportError(
          409,
          `Refusing to roll back: ${bad.size} imported people have notes, reminders, tags, mentions or links added since the import (pass --force to delete them too):\n  ${report.refused.slice(0, 20).join("\n  ")}`,
        );
      }
    }

    const affectedPeople = new Set<string>();
    for (const r of rows) {
      if (!(LOGGED_TABLES as readonly string[]).includes(r.tableName)) throw new Error(`unexpected table in commit log: ${r.tableName}`);
      const t = sql.identifier(r.tableName);
      const keyCols = Object.keys(r.rowKey);
      const keyJson = JSON.stringify(r.rowKey);
      const where = sql.join(
        keyCols.map((k) => sql`t.${sql.identifier(k)} = (select ${sql.identifier(k)} from jsonb_populate_record(null::${t}, ${keyJson}::jsonb))`),
        sql` and `,
      );
      if (r.tableName === "people") affectedPeople.add(r.rowKey.id!);
      if (r.rowKey.person_id) affectedPeople.add(r.rowKey.person_id);
      if (r.tableName === "notes" || r.tableName === "reminders") {
        const pr = (await tx.execute(sql`select person_id from ${t} t where ${where}`)) as unknown as { person_id: string }[];
        if (pr[0]) affectedPeople.add(pr[0].person_id);
      }
      const shared = r.op === "insert" ? SHARED_REFS[r.tableName as LoggedTable] : undefined;
      if (shared) {
        const [use] = (await tx.execute(shared(r.rowKey.id!))) as unknown as { used: boolean }[];
        if (use?.used) {
          report.kept[r.tableName] = (report.kept[r.tableName] ?? 0) + 1;
          continue;
        }
      }
      if (r.op === "insert") {
        await tx.execute(sql`delete from ${t} t where ${where}`);
      } else {
        const cols = Object.keys(r.before ?? {});
        if (!cols.length) continue;
        const beforeJson = JSON.stringify(r.before);
        const set = sql.join(
          cols.map((c) => sql`${sql.identifier(c)} = (select ${sql.identifier(c)} from jsonb_populate_record(null::${t}, ${beforeJson}::jsonb))`),
          sql`, `,
        );
        await tx.execute(sql`update ${t} t set ${set} where ${where}`);
      }
      const k = `${r.tableName}:${r.op}`;
      report.reverted[k] = (report.reverted[k] ?? 0) + 1;
    }

    // Derived columns on people that survived.
    const ids = [...affectedPeople];
    if (ids.length) {
      const res = (await tx.execute(sql`
        update people p set
          last_interaction_at = (select max(n.occurred_at) from notes n where n.person_id = p.id and n.deleted_at is null),
          next_followup_at = (select min(r.due_at) from reminders r where r.person_id = p.id and r.status in ('pending', 'sent', 'snoozed'))
        where p.id in (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})
        returning p.id`)) as unknown as unknown[];
      report.peopleRecomputed = res.length;
    }
    // Proposals/items whose committed rows are gone return to approved/extracted (belt and braces;
    // the logged import_people / import_items updates above already restored them).
    await tx.execute(sql`
      update import_people set status = 'approved' where owner_id = ${ownerId} and status = 'committed' and committed_person_id is null`);
    await tx.execute(sql`
      update import_items set status = 'extracted' where owner_id = ${ownerId} and status = 'committed' and note_id is null
        and exists (select 1 from import_mentions m where m.item_id = import_items.id and m.role = 'primary')`);
    await tx.delete(importCommitLog).where(and(eq(importCommitLog.ownerId, ownerId), inArray(importCommitLog.commitId, report.commits)));
    return report;
  });
}

/** Commit ids with their counts (newest first). */
export async function listCommits(db: DbOrTx, ownerId: string, source: string) {
  const rows = (await db.execute(sql`
    select commit_id, min(created_at) as at, count(*)::int as ops,
           count(*) filter (where table_name = 'people' and op = 'insert')::int as people_created,
           count(*) filter (where table_name = 'notes' and op = 'insert')::int as notes_created
    from import_commit_log where owner_id = ${ownerId} and source = ${source}
    group by commit_id order by min(created_at) desc`)) as unknown as { commit_id: string; at: string; ops: number; people_created: number; notes_created: number }[];
  return rows;
}
