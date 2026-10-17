/**
 * Commit approved import proposals into The Network, and roll commits back.
 *
 * Phase 1 — one savepoint per approved person: target = merged_into chain → match_person_id →
 *   existing person with source_ref 'import-person:<id>' → create. FILL BLANKS ONLY on existing
 *   people; arrays unioned; categories by slug; activities/tags find-or-create; one pinned
 *   "From Apple Notes — key facts" note (key facts + open threads); at most one imported reminder.
 * Phase 2 — one savepoint per note: the verbatim note filed under its primary person (or excerpt
 *   notes for list/journal notes), note_mentions for the other committed people, item → committed.
 * Phase 3 — introducedBy links between committed people.
 * Every insert/update is written to import_commit_log (with the previous values) so a commit can
 * be rolled back exactly. A dry run executes everything in one transaction and rolls it back.
 */
import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { schema } from "@/lib/db";
import { activities, importCommitLog, importItemsX, importMentions, importPeople, personActivities, remindersX, type ImportPerson } from "@/lib/db/schema-import";
import { HOBBIES, type Warmth } from "@/lib/constants";
import { htmlToMarkdown } from "@/lib/html-to-md";
import { fromIsoDay, noteDate } from "@/lib/import/dates";
import { createGeocoder, type CityHit, type Geocoder } from "@/lib/import/geo";
import { normalizeExtraction } from "@/lib/import/mentions";
import { readProfile } from "@/lib/import/profile";
import { openThreadsMarkdown, planReminders, type OpenThread, type PersonPlan } from "@/lib/import/reminders-policy";
import { finalProposalResolver } from "./import-resolve";
import { inTransaction, type DbOrTx, type Tx } from "./import-shared";

const { people, notes, noteMentions, personCategories, categories, tags, personTags, locations } = schema;

export const SOURCE_KIND = "apple-notes";
export const FACTS_TITLE = "From Apple Notes — key facts";
export const personSourceRef = (proposalId: string) => `import-person:${proposalId}`;
export const factsSourceRef = (key: string) => `apple-notes:facts:${key}`;
export const excerptSourceRef = (externalId: string, key: string) => `${externalId}#${key}`;

const DAY = 86_400_000;
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
};

async function tableExists(tx: Tx, name: string) {
  const r = (await tx.execute(sql`select to_regclass(${name}) is not null as ok`)) as unknown as { ok: boolean }[];
  return !!r[0]?.ok;
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

const mdToText = (md: string) =>
  md
    .replace(/^#+\s*/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/_\((.+?)\)_/g, "($1)")
    .replace(/^- \[ \] /gm, "☐ ")
    .replace(/^- /gm, "• ");

/** Merges new markdown lines into an existing facts note without dropping anything already there. */
function mergeFactsMd(existing: string, next: string) {
  const have = new Set(existing.split("\n").map((l) => l.trim()).filter(Boolean));
  const add = next.split("\n").filter((l) => l.trim() && !have.has(l.trim()) && !/^## /.test(l));
  return add.length ? `${existing.trimEnd()}\n${add.join("\n")}` : existing;
}

export type PersonResult = { proposalId: string; key: string; personId: string; action: "created" | "updated" | "unchanged" };

async function commitPerson(tx: Tx, ctx: Ctx, log: CommitLog, p: ImportPerson): Promise<PersonResult> {
  // Lock the proposal; a concurrent commit of the same person waits here.
  const [locked] = await tx.select().from(importPeople).where(eq(importPeople.id, p.id)).for("update");
  if (!locked || locked.status !== "approved") throw new Error(`proposal ${p.key} is ${locked?.status ?? "gone"}`);
  const prof = readProfile(locked.profile);
  const names = locked.profile as StoredNames;
  const lc = { personId: locked.id };

  // Target person.
  let personId: string | null = null;
  for (const candidate of [locked.committedPersonId, locked.matchPersonId]) {
    if (!candidate) continue;
    const r = await tx.select({ id: people.id }).from(people).where(and(eq(people.id, candidate), eq(people.ownerId, ctx.ownerId), isNull(people.deletedAt)));
    if (r[0]) {
      personId = r[0].id;
      break;
    }
  }
  if (!personId) {
    const r = await tx
      .select({ id: people.id })
      .from(people)
      .where(and(eq(people.ownerId, ctx.ownerId), eq(people.sourceRef, personSourceRef(locked.id)), isNull(people.deletedAt)));
    personId = r[0]?.id ?? null;
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
        sourceKind: SOURCE_KIND,
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

  // Key facts + open threads → one pinned note.
  const plan = ctx.plans.get(locked.key) ?? { reminder: null, openThreads: [] };
  const md = factsMarkdown(prof.keyFacts, plan.openThreads, { howICanHelp: prof.howICanHelp, whatICanAsk: prof.whatICanAsk });
  if (md) {
    const ref = factsSourceRef(locked.key);
    const [existing] = await tx
      .select({ id: notes.id, contentMd: notes.contentMd })
      .from(notes)
      .where(and(eq(notes.ownerId, ctx.ownerId), eq(notes.sourceKind, SOURCE_KIND), eq(notes.sourceRef, ref), isNull(notes.deletedAt)));
    if (existing) {
      const merged = mergeFactsMd(existing.contentMd, md);
      if (merged !== existing.contentMd) await loggedUpdate(tx, log, "notes", existing.id, { contentMd: merged, contentText: mdToText(merged) }, lc);
    } else {
      const first = fromIsoDay(prof.firstSeen) ?? fromIsoDay(prof.lastSeen) ?? ctx.now;
      const [n] = await tx
        .insert(notes)
        .values({ ownerId: ctx.ownerId, personId, title: FACTS_TITLE, contentMd: md, contentText: mdToText(md), kind: "note", occurredAt: first, pinned: true, sourceKind: SOURCE_KIND, sourceRef: ref })
        .returning({ id: notes.id });
      await log.insert("notes", { id: n!.id }, lc);
    }
  }

  // At most one imported reminder per person.
  if (plan.reminder) {
    const [have] = await tx
      .select({ id: remindersX.id })
      .from(remindersX)
      .where(and(eq(remindersX.ownerId, ctx.ownerId), eq(remindersX.sourceKind, SOURCE_KIND), eq(remindersX.sourceRef, locked.key)));
    if (!have) {
      const [r] = await tx
        .insert(remindersX)
        .values({ ownerId: ctx.ownerId, personId, dueAt: plan.reminder.dueAt, message: plan.reminder.message, recurrence: "none", sourceKind: SOURCE_KIND, sourceRef: locked.key })
        .returning({ id: remindersX.id });
      await log.insert("reminders", { id: r!.id }, lc);
      await syncNextFollowup(tx, personId);
    }
  }

  await loggedUpdate(tx, log, "import_people", locked.id, { status: "committed", committedPersonId: personId }, lc);
  return { proposalId: locked.id, key: locked.key, personId, action };
}

async function syncNextFollowup(tx: Tx, personId: string) {
  await tx.execute(sql`
    update people set next_followup_at = (
      select min(due_at) from reminders where person_id = ${personId} and status in ('pending', 'sent', 'snoozed')
    ) where id = ${personId}`);
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

export type NoteResult = { itemId: string; action: "created" | "updated" | "unchanged" | "excerpts" | "waiting"; noteId: string | null; excerpts: number; mentions: number; waitingOn: string[] };

async function commitNote(tx: Tx, ctx: Ctx, log: CommitLog, it: NoteItem, props: ImportPerson[]): Promise<NoteResult> {
  const final = finalProposalResolver(props);
  const ms = await tx.select().from(importMentions).where(eq(importMentions.itemId, it.id));
  const res: NoteResult = { itemId: it.id, action: "unchanged", noteId: it.noteId, excerpts: 0, mentions: 0, waitingOn: [] };
  const lc = { itemId: it.id };
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
    const content = { title: it.title, contentMd: it.html ? htmlToMarkdown(it.html) : it.text, contentText: it.text, occurredAt: nd };
    let noteId: string | null = null;
    // Existing note: recorded on the item, or found by source ref (re-run after a partial commit).
    for (const cand of [it.noteId]) {
      if (!cand) continue;
      const r = await tx.select({ id: notes.id }).from(notes).where(and(eq(notes.id, cand), isNull(notes.deletedAt)));
      if (r[0]) noteId = r[0].id;
    }
    if (!noteId) {
      const r = await tx
        .select({ id: notes.id })
        .from(notes)
        .where(and(eq(notes.ownerId, ctx.ownerId), eq(notes.sourceKind, SOURCE_KIND), eq(notes.sourceRef, it.externalId), isNull(notes.deletedAt)));
      noteId = r[0]?.id ?? null;
    }
    if (noteId) {
      const [cur] = await tx.select({ contentText: notes.contentText, title: notes.title }).from(notes).where(eq(notes.id, noteId));
      if (cur!.contentText !== it.text || cur!.title !== it.title) {
        await loggedUpdate(tx, log, "notes", noteId, content, lc);
        res.action = "updated";
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
          sourceKind: SOURCE_KIND,
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
    // Everyone else in the note who is committed → mention.
    const others = new Set(fileable.map((r) => committedId(r.p)).filter((x): x is string => !!x && x !== pid));
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
      const excerpt = r.m.excerpt ?? ex.candidates.find((c) => c.index === r.m.candidateIndex)?.excerpt ?? null;
      if (!excerpt || !it.text.includes(excerpt)) {
        ctx.warnings.push(`no verbatim excerpt for ${r.p.key} in “${it.title}”`);
        continue;
      }
      const ref = excerptSourceRef(it.externalId, r.p.key);
      const [have] = await tx
        .select({ id: notes.id, contentText: notes.contentText })
        .from(notes)
        .where(and(eq(notes.ownerId, ctx.ownerId), eq(notes.sourceKind, SOURCE_KIND), eq(notes.sourceRef, ref), isNull(notes.deletedAt)));
      if (have) {
        if (have.contentText !== excerpt) await loggedUpdate(tx, log, "notes", have.id, { contentMd: excerpt, contentText: excerpt, occurredAt: nd }, lc);
        continue;
      }
      const [n] = await tx
        .insert(notes)
        .values({ ownerId: ctx.ownerId, personId: pid, title: `${it.title ?? "Note"} (excerpt)`, contentMd: excerpt, contentText: excerpt, kind: "note", occurredAt: nd, pinned: false, sourceKind: SOURCE_KIND, sourceRef: ref })
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

export type CommitReport = {
  commitId: string;
  dryRun: boolean;
  people: { created: number; updated: number; unchanged: number; failed: { key: string; error: string }[]; results: PersonResult[] };
  notes: { created: number; updated: number; unchanged: number; excerpts: number; mentions: number; waiting: number; partial: number; failed: { itemId: string; title: string | null; error: string }[] };
  introductions: number;
  reminders: number;
  log: Record<string, number>;
  warnings: string[];
};

export async function commitImport(db: DbOrTx, ownerId: string, opts: { source: string; dryRun: boolean; limit?: number; keys?: string[]; now?: Date; commitId?: string }): Promise<CommitReport> {
  const commitId = opts.commitId ?? randomUUID();
  const now = opts.now ?? new Date();
  return inTransaction(db, !opts.dryRun, async (outer) => {
    const report: CommitReport = {
      commitId,
      dryRun: opts.dryRun,
      people: { created: 0, updated: 0, unchanged: 0, failed: [], results: [] },
      notes: { created: 0, updated: 0, unchanged: 0, excerpts: 0, mentions: 0, waiting: 0, partial: 0, failed: [] },
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
      .where(and(eq(importItemsX.ownerId, ownerId), eq(importItemsX.source, opts.source), isNull(importItemsX.goneAt), inArray(importItemsX.status, ["extracted", "committed"])))) as NoteItem[];
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

    // Reminder plan across everyone committed in this run (≤3/day spread is global).
    const plans = planReminders(
      toCommit.map((p) => {
        const prof = readProfile(p.profile);
        return {
          key: p.key,
          createReminder: p.createReminder,
          followUps: prof.followUps.map((f) => {
            const d = f.sourceItemId ? itemDates.get(f.sourceItemId) : undefined;
            const fallback = fromIsoDay(prof.lastSeen) ?? now;
            return { what: f.what, when: f.when, explicitDate: f.when && /^\d{4}-\d{2}-\d{2}$/.test(f.when) ? f.when : null, noteDate: d?.date ?? fallback, sourceItemId: f.sourceItemId, sourceTitle: d?.title ?? null };
          }),
        };
      }),
      now,
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
    };
    if (!ctx.hasActivities) report.warnings.push("activities/person_activities tables not found — activities stored as legacy hobbies where they match");

    // Phase 1
    for (const p of toCommit) {
      try {
        let child: CommitLog | null = null;
        const r = await outer.transaction(async (tx) => commitPerson(tx, ctx, (child = log.with(tx)), p));
        log.absorb(child!);
        report.people.results.push(r);
        report.people[r.action]++;
        if (plans.get(p.key)?.reminder) report.reminders++;
      } catch (e) {
        report.people.failed.push({ key: p.key, error: (e as Error).message });
      }
    }

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
    for (const it of items.filter((i) => filed.has(i.id))) {
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
      } catch (e) {
        report.notes.failed.push({ itemId: it.id, title: it.title, error: (e as Error).message });
      }
    }

    // Phase 3: introducedBy among committed people (fill blank only).
    const byKey = new Map(props.map((p) => [p.key, p]));
    for (const r of report.people.results) {
      const p = byKey.get(r.key);
      const introKey = p ? readProfile(p.profile).introducedByKey : null;
      const intro = introKey ? byKey.get(introKey) : undefined;
      if (!intro?.committedPersonId || intro.committedPersonId === r.personId) continue;
      const [cur] = await outer.select({ introducedById: people.introducedById }).from(people).where(eq(people.id, r.personId));
      if (cur && !cur.introducedById) {
        await loggedUpdate(outer, log, "people", r.personId, { introducedById: intro.committedPersonId }, { personId: r.proposalId });
        report.introductions++;
      }
    }
    report.log = log.counts;
    return report;
  });
}

/* ------------------------------------------------------------------ */
/*  Rollback                                                           */
/* ------------------------------------------------------------------ */

export type RollbackReport = { commits: string[]; reverted: Record<string, number>; refused: string[]; peopleRecomputed: number; dryRun: boolean };

export async function rollbackImport(db: DbOrTx, ownerId: string, opts: { commitId?: string; source?: string; dryRun: boolean; force?: boolean }): Promise<RollbackReport> {
  if (!opts.commitId && !opts.source) throw new Error("rollback needs a commit id or a source");
  return inTransaction(db, !opts.dryRun, async (tx) => {
    const rows = await tx
      .select()
      .from(importCommitLog)
      .where(and(eq(importCommitLog.ownerId, ownerId), opts.commitId ? eq(importCommitLog.commitId, opts.commitId) : eq(importCommitLog.source, opts.source!)))
      .orderBy(sql`${importCommitLog.id} desc`);
    const report: RollbackReport = { commits: [...new Set(rows.map((r) => r.commitId))], reverted: {}, refused: [], peopleRecomputed: 0, dryRun: opts.dryRun };
    if (!rows.length) return report;

    // Refuse to delete people who have notes/reminders the log did not create (added by hand since).
    const loggedIds = (t: string) => new Set(rows.filter((r) => r.tableName === t && r.op === "insert").map((r) => r.rowKey.id));
    const loggedNotes = loggedIds("notes");
    const loggedReminders = loggedIds("reminders");
    const insertedPeople = [...loggedIds("people")];
    if (insertedPeople.length) {
      const foreignNotes = await tx.select({ id: notes.id, personId: notes.personId }).from(notes).where(and(inArray(notes.personId, insertedPeople), isNull(notes.deletedAt)));
      const foreignRem = await tx.select({ id: remindersX.id, personId: remindersX.personId }).from(remindersX).where(inArray(remindersX.personId, insertedPeople));
      const bad = new Map<string, string[]>();
      for (const n of foreignNotes) if (!loggedNotes.has(n.id)) bad.set(n.personId, [...(bad.get(n.personId) ?? []), `note ${n.id}`]);
      for (const r of foreignRem) if (!loggedReminders.has(r.id)) bad.set(r.personId, [...(bad.get(r.personId) ?? []), `reminder ${r.id}`]);
      if (bad.size && !opts.force) {
        report.refused = [...bad.entries()].map(([pid, what]) => `person ${pid}: ${what.join(", ")}`);
        throw new Error(`Refusing to roll back: ${bad.size} imported people have notes/reminders not created by the import (pass --force to delete them too):\n  ${report.refused.slice(0, 20).join("\n  ")}`);
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
