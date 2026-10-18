import "server-only";
import { and, desc, eq, isNotNull, isNull, lt, ne, or, sql, type SQL } from "drizzle-orm";
import { db, schema, type Tx } from "@/lib/db";
import { qcol } from "./sql";
import { HttpError } from "@/lib/errors";
import { planNoteWrite } from "@/lib/notes/write-rules";
import type { NoteData, NotePatchData, NoteUpsertData } from "@/lib/schemas";
import { EXCERPT_LENGTH } from "./people";
import { likePattern, toTsQuery } from "./search-query";

const { notes, noteMentions, people } = schema;

/** Columns of a full note (never the internal `search` vector). */
const noteColumns = {
  id: notes.id,
  ownerId: notes.ownerId,
  personId: notes.personId,
  title: notes.title,
  contentJson: notes.contentJson,
  contentMd: notes.contentMd,
  contentText: notes.contentText,
  kind: notes.kind,
  occurredAt: notes.occurredAt,
  pinned: notes.pinned,
  sourceKind: notes.sourceKind,
  sourceRef: notes.sourceRef,
  createdAt: notes.createdAt,
  updatedAt: notes.updatedAt,
  deletedAt: notes.deletedAt,
};

const excerpt = sql<string>`left(${notes.contentText}, ${EXCERPT_LENGTH})`;

/** A full note with the people it mentions. Deleted notes only with `includeDeleted`. */
export async function getNote(ownerId: string, id: string, opts: { includeDeleted?: boolean } = {}) {
  const [row] = await db
    .select({
      ...noteColumns,
      mentions: sql<{ id: string; displayName: string; avatarUrl: string | null }[]>`coalesce((
        select json_agg(json_build_object('id', p.id, 'displayName', p.display_name, 'avatarUrl', p.avatar_url) order by p.display_name)
        from ${noteMentions} m join ${people} p on p.id = m.person_id
        where m.note_id = ${qcol(notes.id)} and p.deleted_at is null), '[]'::json)`,
    })
    .from(notes)
    .where(and(eq(notes.ownerId, ownerId), eq(notes.id, id), opts.includeDeleted ? undefined : isNull(notes.deletedAt)));
  return row ?? null;
}
export type NoteDetail = NonNullable<Awaited<ReturnType<typeof getNote>>>;

/** True if `personId` is one of the owner's live people. */
async function ownsPerson(tx: Tx | typeof db, ownerId: string, personId: string) {
  const [row] = await tx.select({ id: people.id }).from(people).where(and(eq(people.ownerId, ownerId), eq(people.id, personId), isNull(people.deletedAt)));
  return !!row;
}

async function setMentions(tx: Tx, ownerId: string, noteId: string, personIds: string[]) {
  await tx.delete(noteMentions).where(and(eq(noteMentions.ownerId, ownerId), eq(noteMentions.noteId, noteId)));
  const unique = [...new Set(personIds)];
  if (!unique.length) return;
  await tx.execute(
    sql`insert into note_mentions (note_id, person_id, owner_id) select ${noteId}, p.id, ${ownerId} from people p where p.owner_id = ${ownerId} and p.id in ${unique} on conflict do nothing`,
  );
}

function contentValues(patch: NotePatchData): Partial<schema.NewNote> {
  const { mentionIds: _m, occurredAt, personId: _p, contentJson, ...cols } = patch;
  const values: Partial<schema.NewNote> = { ...cols };
  if (contentJson !== undefined) values.contentJson = contentJson ?? null;
  if (occurredAt) values.occurredAt = new Date(occurredAt);
  return values;
}

/** Creates a note about one of the owner's people. Throws HttpError(404) for an unknown person. */
export async function createNote(ownerId: string, input: NoteData & { id?: string }, source?: { kind: string; ref: string | null }): Promise<NoteDetail> {
  const id = await db.transaction(async (tx) => {
    if (!(await ownsPerson(tx, ownerId, input.personId))) throw new HttpError(404, "Unknown person");
    const [row] = await tx
      .insert(notes)
      .values({
        ...contentValues(input),
        ...(input.id ? { id: input.id } : {}),
        ownerId,
        personId: input.personId,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
        sourceKind: source?.kind ?? null,
        sourceRef: source?.ref ?? null,
      })
      .returning({ id: notes.id });
    await setMentions(tx, ownerId, row!.id, input.mentionIds);
    return row!.id;
  });
  return (await getNote(ownerId, id))!;
}

export type NoteWriteResult =
  | { status: "ok"; note: NoteDetail; created: boolean }
  /** The write would have left the note without words: it was soft-deleted instead (its last words kept). */
  | { status: "deleted"; note: NoteDetail }
  | { status: "not_found" } // no such note (patch) or unknown person
  | { status: "gone" } // soft-deleted; send `restore: true` to revive
  | { status: "conflict"; note: NoteDetail } // the content changed since the version the write was based on
  | { status: "invalid"; message: string };

/** Restoring an imported note whose source was imported again meanwhile would duplicate it. */
const DUPLICATE_SOURCE = "A newer copy of this imported note is already in your notes, so this one can’t be restored.";

/** Postgres unique violation (23505), possibly wrapped by Drizzle. */
function isUniqueViolation(e: unknown): boolean {
  for (let err = e as { code?: unknown; cause?: unknown } | null, i = 0; err && i < 3; err = err.cause as typeof err, i++) if (err.code === "23505") return true;
  return false;
}

/** A live note from the same import source as `id` (the partial unique index `notes_owner_source_uidx`). */
async function hasLiveDuplicate(tx: Tx | typeof db, ownerId: string, id: string, row: { sourceKind: string | null; sourceRef: string | null }) {
  if (!row.sourceKind || !row.sourceRef) return false;
  const [dup] = await tx
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.ownerId, ownerId), eq(notes.sourceKind, row.sourceKind), eq(notes.sourceRef, row.sourceRef), isNull(notes.deletedAt), ne(notes.id, id)))
    .limit(1);
  return !!dup;
}

/** Runs a write that may revive a note; a lost race on the source index becomes a clean 409. */
async function guardDuplicate<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (isUniqueViolation(e)) throw new HttpError(409, DUPLICATE_SOURCE, "duplicate");
    throw e;
  }
}

const CONTENT_FIELDS = ["title", "contentJson", "contentMd", "contentText"] as const;

async function applyPatch(tx: Tx, ownerId: string, id: string, patch: NotePatchData, restore = false): Promise<"ok" | "not_found"> {
  const values = contentValues(patch);
  if (patch.personId) {
    if (!(await ownsPerson(tx, ownerId, patch.personId))) return "not_found";
    values.personId = patch.personId;
  }
  if (restore) values.deletedAt = null;
  if (Object.keys(values).length) await tx.update(notes).set(values).where(and(eq(notes.ownerId, ownerId), eq(notes.id, id)));
  if (patch.mentionIds) await setMentions(tx, ownerId, id, patch.mentionIds);
  if (patch.personId) {
    // Moving a note counts as an interaction for its new person.
    await tx.execute(
      sql`update people p set last_interaction_at = greatest(coalesce(p.last_interaction_at, 'epoch'::timestamptz), n.occurred_at) from notes n where n.id = ${id} and p.id = n.person_id`,
    );
  }
  return "ok";
}

const writeColumns = {
  ownerId: notes.ownerId,
  title: notes.title,
  contentText: notes.contentText,
  contentMd: notes.contentMd,
  deletedAt: notes.deletedAt,
  sourceKind: notes.sourceKind,
  sourceRef: notes.sourceRef,
};
type WriteRow = { ownerId: string; title: string | null; contentText: string; contentMd: string; deletedAt: Date | null; sourceKind: string | null; sourceRef: string | null };

type TxResult =
  | { status: "ok"; created: boolean }
  | { status: "deleted" }
  | { status: "conflict" }
  | { status: "not_found" }
  | { status: "gone" }
  | { status: "invalid"; message: string };

/**
 * Applies a PUT/PATCH to an existing row per `planNoteWrite` (see lib/notes/write-rules): blanking
 * soft-deletes, stale content saves conflict, restores never revive blank content or duplicate an
 * imported note.
 */
async function writeExisting(tx: Tx, ownerId: string, id: string, row: WriteRow, input: NoteUpsertData): Promise<TxResult> {
  const { restore, baseVersions: _versions, ...patch } = input;
  const plan = planNoteWrite(row, input);
  switch (plan.kind) {
    case "gone":
      return { status: "gone" };
    case "conflict":
      return { status: "conflict" };
    case "invalid":
      return { status: "invalid", message: plan.message };
    case "delete-empty":
      await tx.update(notes).set({ deletedAt: new Date() }).where(and(eq(notes.ownerId, ownerId), eq(notes.id, id), isNull(notes.deletedAt)));
      return { status: "deleted" };
    case "create": // only planned for rows that don't exist
      return { status: "not_found" };
    case "update": {
      if (restore && row.deletedAt && (await hasLiveDuplicate(tx, ownerId, id, row))) throw new HttpError(409, DUPLICATE_SOURCE, "duplicate");
      const values: NotePatchData = { ...patch };
      if (plan.keepContent) for (const k of CONTENT_FIELDS) delete values[k];
      const r = await applyPatch(tx, ownerId, id, values, restore);
      return r === "ok" ? { status: "ok", created: false } : { status: r };
    }
  }
}

async function finish(ownerId: string, id: string, result: TxResult): Promise<NoteWriteResult> {
  switch (result.status) {
    case "ok":
      return { status: "ok", note: (await getNote(ownerId, id))!, created: result.created };
    case "deleted":
      return { status: "deleted", note: (await getNote(ownerId, id, { includeDeleted: true }))! };
    case "conflict":
      return { status: "conflict", note: (await getNote(ownerId, id))! };
    default:
      return result;
  }
}

/** Partial update (PATCH). `personId` moves the note. Deleted notes are not updated; blanking soft-deletes. */
export async function updateNote(ownerId: string, id: string, patch: NotePatchData): Promise<NoteWriteResult> {
  const result = await db.transaction(async (tx): Promise<TxResult> => {
    const [row] = await tx.select(writeColumns).from(notes).where(and(eq(notes.ownerId, ownerId), eq(notes.id, id))).for("update");
    if (!row) return { status: "not_found" };
    return writeExisting(tx, ownerId, id, row, patch);
  });
  return finish(ownerId, id, result);
}

/**
 * Idempotent create-or-update with a client-generated id (PUT). Offline clients can replay it any
 * number of times. Creating requires `personId` and some words (422 otherwise); a soft-deleted note
 * answers "gone" unless `restore` is set; a content save with `baseVersions` answers "conflict"
 * (with the current note) when the stored content changed meanwhile.
 */
export async function upsertNote(ownerId: string, id: string, input: NoteUpsertData): Promise<NoteWriteResult> {
  const { restore: _r, baseVersions: _b, ...patch } = input;
  const result = await guardDuplicate(() =>
    db.transaction(async (tx): Promise<TxResult> => {
      const [row] = await tx.select(writeColumns).from(notes).where(eq(notes.id, id)).for("update");
      if (row && row.ownerId !== ownerId) return { status: "not_found" };
      if (row) return writeExisting(tx, ownerId, id, row, input);
      const plan = planNoteWrite(null, input);
      if (plan.kind === "invalid") return { status: "invalid", message: plan.message };
      if (!(await ownsPerson(tx, ownerId, patch.personId!))) return { status: "not_found" };
      const inserted = await tx
        .insert(notes)
        .values({
          ...contentValues(patch),
          id,
          ownerId,
          personId: patch.personId!,
          occurredAt: patch.occurredAt ? new Date(patch.occurredAt) : new Date(),
        })
        .onConflictDoNothing({ target: notes.id })
        .returning({ id: notes.id });
      if (!inserted.length) {
        // Lost a race with a concurrent replay of the same create: apply as an update.
        const r = await applyPatch(tx, ownerId, id, patch);
        return r === "ok" ? { status: "ok", created: false } : { status: r };
      }
      if (patch.mentionIds) await setMentions(tx, ownerId, id, patch.mentionIds);
      return { status: "ok", created: true };
    }),
  );
  return finish(ownerId, id, result);
}

/** Soft delete. Returns false if there was nothing to delete. */
export async function deleteNote(ownerId: string, id: string): Promise<boolean> {
  const rows = await db
    .update(notes)
    .set({ deletedAt: new Date() })
    .where(and(eq(notes.ownerId, ownerId), eq(notes.id, id), isNull(notes.deletedAt)))
    .returning({ id: notes.id });
  return rows.length > 0;
}

/**
 * Undoes a soft delete → the note, or null if there's no such note. Throws HttpError(409) when an
 * imported note's source was imported again since (the newer copy stays; no duplicate).
 */
export async function restoreNote(ownerId: string, id: string) {
  const found = await guardDuplicate(() =>
    db.transaction(async (tx) => {
      const [row] = await tx.select(writeColumns).from(notes).where(and(eq(notes.ownerId, ownerId), eq(notes.id, id))).for("update");
      if (!row) return false;
      if (row.deletedAt && (await hasLiveDuplicate(tx, ownerId, id, row))) throw new HttpError(409, DUPLICATE_SOURCE, "duplicate");
      if (row.deletedAt) await tx.update(notes).set({ deletedAt: null }).where(and(eq(notes.ownerId, ownerId), eq(notes.id, id)));
      return true;
    }),
  );
  return found ? getNote(ownerId, id) : null;
}

/* ------------------------------------------------------------------ */
/*  Lists & search                                                     */
/* ------------------------------------------------------------------ */

const summaryColumns = {
  id: notes.id,
  personId: notes.personId,
  title: notes.title,
  excerpt,
  kind: notes.kind,
  occurredAt: notes.occurredAt,
  pinned: notes.pinned,
  updatedAt: notes.updatedAt,
};

function encodeNoteCursor(occurredAt: string, id: string) {
  return Buffer.from(JSON.stringify([occurredAt, id])).toString("base64url");
}
function decodeNoteCursor(raw: string | null | undefined): [string, string] | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    return Array.isArray(v) && typeof v[0] === "string" && typeof v[1] === "string" && /^[0-9a-f-]{36}$/i.test(v[1]) ? [v[0], v[1]] : null;
  } catch {
    return null;
  }
}

/**
 * A person's notes, newest first, keyset-paginated. `full` adds the whole text, markdown and
 * rich JSON; otherwise each note carries a 280-character excerpt.
 */
export async function listNotes(ownerId: string, personId: string, opts: { before?: string | null; limit?: number; full?: boolean } = {}) {
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 30), 1), 100);
  const cursor = decodeNoteCursor(opts.before);
  const where: (SQL | undefined)[] = [eq(notes.ownerId, ownerId), eq(notes.personId, personId), isNull(notes.deletedAt)];
  if (cursor) where.push(sql`(${notes.occurredAt}, ${notes.id}) < (${cursor[0]}::timestamptz, ${cursor[1]}::uuid)`);
  const rows = await db
    .select({
      ...summaryColumns,
      ...(opts.full ? { contentText: notes.contentText, contentMd: notes.contentMd, contentJson: notes.contentJson } : {}),
      cursorKey: sql<string>`${notes.occurredAt}::text`,
    })
    .from(notes)
    .where(and(...where))
    .orderBy(desc(notes.occurredAt), desc(notes.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map(({ cursorKey: _k, ...n }) => n),
    nextCursor: rows.length > limit && last ? encodeNoteCursor(last.cursorKey, last.id) : null,
  };
}

/** Recently edited notes across everyone (Today screen). */
export async function recentNotes(ownerId: string, limit = 10) {
  return db
    .select({ ...summaryColumns, person: sql<{ id: string; displayName: string; avatarUrl: string | null }>`json_build_object('id', ${people.id}, 'displayName', ${people.displayName}, 'avatarUrl', ${people.avatarUrl})` })
    .from(notes)
    .innerJoin(people, eq(people.id, notes.personId))
    .where(and(eq(notes.ownerId, ownerId), isNull(notes.deletedAt), isNull(people.deletedAt)))
    .orderBy(desc(notes.updatedAt))
    .limit(Math.min(Math.max(Math.trunc(limit), 1), 100));
}

export type NoteSearchHit = {
  id: string;
  personId: string;
  personName: string;
  title: string | null;
  /** Matching fragments with matches wrapped in **…** (markdown bold). */
  snippet: string;
  kind: string;
  occurredAt: Date;
  rank: number;
};

/**
 * Full-text search over notes (title weighted above body), ranked, with highlighted snippets.
 * Falls back to substring matching when full-text finds nothing (e.g. a fragment inside a word).
 */
export async function searchNotes(
  ownerId: string,
  opts: { query: string; personId?: string; since?: Date; until?: Date; limit?: number },
): Promise<NoteSearchHit[]> {
  const text = opts.query.trim();
  if (!text) return [];
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 20), 1), 100);
  const scope = and(
    eq(notes.ownerId, ownerId),
    isNull(notes.deletedAt),
    isNull(people.deletedAt),
    opts.personId ? eq(notes.personId, opts.personId) : undefined,
    opts.since ? sql`${notes.occurredAt} >= ${opts.since.toISOString()}::timestamptz` : undefined,
    opts.until ? lt(notes.occurredAt, opts.until) : undefined,
  );
  const base = {
    id: notes.id,
    personId: notes.personId,
    personName: people.displayName,
    title: notes.title,
    kind: notes.kind,
    occurredAt: notes.occurredAt,
  };

  const tsq = toTsQuery(text);
  if (tsq) {
    const query = sql`to_tsquery('public.network', ${tsq})`;
    const rank = sql<number>`ts_rank_cd(${notes.search}, ${query})`.mapWith(Number);
    const hits = await db
      .select({
        ...base,
        rank,
        snippet: sql<string>`ts_headline('public.network', ${notes.contentText}, ${query}, 'StartSel=**, StopSel=**, MaxWords=24, MinWords=8, MaxFragments=2, FragmentDelimiter=" … "')`,
      })
      .from(notes)
      .innerJoin(people, eq(people.id, notes.personId))
      .where(and(scope, sql`${notes.search} @@ ${query}`))
      .orderBy(desc(rank), desc(notes.occurredAt))
      .limit(limit);
    if (hits.length) return hits;
  }

  if (text.length < 3) return [];
  const pattern = likePattern(text);
  return db
    .select({ ...base, rank: sql<number>`0`.mapWith(Number), snippet: excerpt })
    .from(notes)
    .innerJoin(people, eq(people.id, notes.personId))
    .where(and(scope, or(sql`${notes.contentText} ilike ${pattern}`, sql`${notes.title} ilike ${pattern}`)))
    .orderBy(desc(notes.occurredAt))
    .limit(limit);
}

/**
 * One-off cleanup: soft-deletes notes with no title and no text (left behind by "New note" taps
 * and by the v1 partial-update bug that blanked content). Returns how many were removed.
 */
export async function deleteEmptyNotes(ownerId: string, opts: { dryRun?: boolean } = {}) {
  const empty = and(
    eq(notes.ownerId, ownerId),
    isNull(notes.deletedAt),
    sql`btrim(${notes.contentText}) = ''`,
    sql`coalesce(btrim(${notes.title}), '') = ''`,
  );
  if (opts.dryRun) {
    const rows = await db.select({ id: notes.id }).from(notes).where(empty);
    return rows.length;
  }
  const rows = await db.update(notes).set({ deletedAt: new Date() }).where(empty).returning({ id: notes.id });
  return rows.length;
}

/** Notes that were soft-deleted (for an undo/trash view). */
export async function listDeletedNotes(ownerId: string, limit = 50) {
  return db
    .select({ ...summaryColumns, deletedAt: notes.deletedAt })
    .from(notes)
    .where(and(eq(notes.ownerId, ownerId), isNotNull(notes.deletedAt)))
    .orderBy(desc(notes.deletedAt))
    .limit(limit);
}
