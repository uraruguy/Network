/**
 * Query-cache surgery for notes. Every write patches the caches the UI reads (the note itself,
 * the person page's `notes[]` summary + `notesCount`, the person's paginated note list and the
 * recent-notes list) so lists are right instantly — offline too — without refetching on every
 * keystroke. A debounced invalidate (scheduleNotesSync) reconciles with the server once the
 * user leaves the editor and the writes have drained.
 */
import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type { JSONContent } from "@tiptap/react";
import type { NoteKind } from "@/lib/constants";
import { keys } from "@/lib/queries/keys";
import { writeEntity } from "@/lib/queries/write-order";
import type { NoteDetail, NoteSummary, NotesPage, PersonDetailApi, RecentNoteApi } from "@/lib/queries/types";
import { emptyNoteDoc } from "./doc";

/** Characters kept in list excerpts (matches the server's EXCERPT_LENGTH). */
export const EXCERPT_LENGTH = 280;

/** A note as cached on the client. Dates arrive as ISO strings (typed as Date by the server). */
export type NoteDoc = NoteDetail & {
  /** Never confirmed by the server: a fresh draft, or a create that is still queued. */
  localOnly?: boolean;
  /** The note was deleted (by us, or the server answered 404/410). */
  deleted?: boolean;
  /**
   * The cached content is newer than the server's (a save is queued, in flight, or was lost
   * with a closed tab). The cache is persisted, so `reconcileNotes` can resend it.
   */
  syncPending?: boolean;
  /**
   * Server content versions the cached content may replace (see lib/notes/version) — kept while
   * local content is on its way, so a resend after a lost write is still conditional. Absent:
   * the cached content is the server's own.
   */
  baseVersions?: string[];
  /**
   * A content save was refused because the note changed on another device: the cache now holds
   * that version, and the local words were kept as this new note. Set only while the note is on
   * screen, for the page to follow; cleared once handled.
   */
  forkedTo?: string;
};

/**
 * A note's own mutation scope: all writes to one note run in order (create → updates → delete).
 * A note for a person still being created offline runs in that person's scope instead (see
 * lib/queries/write-order).
 */
export const noteScopeId = (id: string) => `note:${id}`;

const iso = (d: Date | string | number) => new Date(d).toISOString() as unknown as Date;
const time = (d: unknown) => new Date(d as string).getTime() || 0;

export type DraftInput = {
  id: string;
  personId: string;
  kind?: NoteKind;
  title?: string | null;
  contentMd?: string;
  contentText?: string;
  contentJson?: JSONContent | null;
  occurredAt?: string | Date;
  pinned?: boolean;
};

/** A local, unsaved note. With no content it opens as an empty "Title" heading. */
export function makeDraftNote(input: DraftInput): NoteDoc {
  const now = iso(Date.now());
  const hasMd = !!input.contentMd?.trim();
  return {
    id: input.id,
    ownerId: "",
    personId: input.personId,
    title: input.title ?? null,
    contentJson: input.contentJson !== undefined ? input.contentJson : hasMd ? null : emptyNoteDoc(),
    contentMd: input.contentMd ?? "",
    contentText: input.contentText ?? "",
    kind: input.kind ?? "note",
    occurredAt: input.occurredAt ? iso(input.occurredAt) : now,
    pinned: input.pinned ?? false,
    sourceKind: null,
    sourceRef: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    mentions: [],
    localOnly: true,
  };
}

/** The list-row shape of a note. */
export function toSummary(n: Pick<NoteDoc, "id" | "personId" | "title" | "kind" | "occurredAt" | "pinned" | "updatedAt" | "contentText">): NoteSummary {
  return {
    id: n.id,
    personId: n.personId,
    title: n.title,
    kind: n.kind,
    occurredAt: n.occurredAt,
    pinned: n.pinned,
    updatedAt: n.updatedAt,
    excerpt: (n.contentText ?? "").slice(0, EXCERPT_LENGTH),
  };
}

/** Pinned first, then newest first — the person page order. */
export function sortSummaries<T extends { id: string; pinned: boolean; occurredAt: unknown }>(list: T[]): T[] {
  return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || time(b.occurredAt) - time(a.occurredAt) || (a.id < b.id ? 1 : -1));
}

type ListOpts = {
  /** The note did not exist before this write (counts toward `notesCount`). */
  isNew?: boolean;
  /** The person the note moved away from. */
  fromPersonId?: string | null;
};

/** Inserts or replaces a note in every list cache (moving it between people when needed). */
export function upsertNoteInLists(qc: QueryClient, s: NoteSummary, opts: ListOpts = {}) {
  if (opts.fromPersonId && opts.fromPersonId !== s.personId) removeNoteFromLists(qc, s.id, opts.fromPersonId, { countDelta: -1 });
  const moved = !!opts.fromPersonId && opts.fromPersonId !== s.personId;

  qc.setQueryData<PersonDetailApi>(keys.person(s.personId), (p) => {
    if (!p) return p;
    const exists = p.notes.some((n) => n.id === s.id);
    const notes = sortSummaries([...p.notes.filter((n) => n.id !== s.id), { ...p.notes.find((n) => n.id === s.id), ...s }]);
    return { ...p, notes, notesCount: p.notesCount + (!exists && (opts.isNew || moved) ? 1 : 0) };
  });

  qc.setQueriesData<InfiniteData<NotesPage>>({ queryKey: keys.personNotes(s.personId) }, (data) => {
    if (!data?.pages) return data;
    let found = false;
    const pages = data.pages.map((page) => {
      if (!page.items.some((n) => n.id === s.id)) return page;
      found = true;
      return { ...page, items: page.items.map((n) => (n.id === s.id ? { ...n, ...s } : n)) };
    });
    if (!found && (opts.isNew || moved) && pages[0]) pages[0] = { ...pages[0], items: [s, ...pages[0].items] };
    return { ...data, pages: pages.map((page) => ({ ...page, items: [...page.items].sort((a, b) => time(b.occurredAt) - time(a.occurredAt)) })) };
  });

  qc.setQueryData<RecentNoteApi[]>(keys.recentNotes(), (list) => {
    if (!list) return list;
    const prev = list.find((n) => n.id === s.id);
    const person = prev?.person ?? personRef(qc, s.personId);
    if (!person) return list.filter((n) => n.id !== s.id);
    return [{ ...prev, ...s, person } as RecentNoteApi, ...list.filter((n) => n.id !== s.id)];
  });
}

/** A note's list row from whichever list cache has it (person page, paginated list, recent). */
export function findSummary(qc: QueryClient, id: string): NoteSummary | null {
  for (const [, p] of qc.getQueriesData<PersonDetailApi>({ queryKey: ["person"] })) {
    const hit = p?.notes?.find((n) => n.id === id);
    if (hit) return hit;
  }
  for (const [, data] of qc.getQueriesData<InfiniteData<NotesPage>>({ queryKey: ["notes", "person"] })) {
    for (const page of data?.pages ?? []) {
      const hit = page.items.find((n) => n.id === id);
      if (hit) return hit;
    }
  }
  return qc.getQueryData<RecentNoteApi[]>(keys.recentNotes())?.find((n) => n.id === id) ?? null;
}

function personRef(qc: QueryClient, personId: string) {
  const p = qc.getQueryData<PersonDetailApi>(keys.person(personId));
  return p ? { id: p.id, displayName: p.displayName, avatarUrl: p.avatarUrl } : null;
}

/** Removes a note from every list cache. `countDelta` adjusts the person's `notesCount`. */
export function removeNoteFromLists(qc: QueryClient, id: string, personId: string, opts: { countDelta?: number } = {}) {
  qc.setQueryData<PersonDetailApi>(keys.person(personId), (p) => {
    if (!p) return p;
    const existed = p.notes.some((n) => n.id === id);
    const delta = opts.countDelta ?? (existed ? -1 : 0);
    return { ...p, notes: p.notes.filter((n) => n.id !== id), notesCount: Math.max(0, p.notesCount + delta) };
  });
  qc.setQueriesData<InfiniteData<NotesPage>>({ queryKey: keys.personNotes(personId) }, (data) =>
    data?.pages ? { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.filter((n) => n.id !== id) })) } : data,
  );
  qc.setQueryData<RecentNoteApi[]>(keys.recentNotes(), (list) => list?.filter((n) => n.id !== id));
}

/* ------------------------------------------------------------------ */
/*  Pending writes & reconciliation                                    */
/* ------------------------------------------------------------------ */

const isNoteWrite = (m: { options: { mutationKey?: readonly unknown[] } }) => m.options.mutationKey?.[0] === "notes";

/** True for a write to this note, whichever scope it runs in. */
export const isWriteForNote = (m: { options: { mutationKey?: readonly unknown[] }; state: { variables?: unknown } }, id: string) =>
  writeEntity(m.options.mutationKey, m.state.variables) === noteScopeId(id);

/** Writes for this note that haven't settled (queued, paused offline or in flight). */
export function pendingNoteWrites(qc: QueryClient, id: string, except?: unknown) {
  return qc
    .getMutationCache()
    .getAll()
    .filter((m) => m.state.status === "pending" && isWriteForNote(m, id) && (except === undefined || m.state.variables !== except));
}

const syncPeople = new Set<string>();
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncWaiting: (() => void) | null = null;

/**
 * One reconciling refetch after editing: waits until note writes have drained (they may be
 * paused offline), then refreshes the affected person pages, note lists and the people index.
 */
export function scheduleNotesSync(qc: QueryClient, personIds: (string | null | undefined)[], delay = 700) {
  personIds.forEach((p) => p && syncPeople.add(p));
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    syncWaiting?.();
    syncWaiting = null;
    const run = () => {
      syncWaiting?.();
      syncWaiting = null;
      const people = [...syncPeople];
      syncPeople.clear();
      people.forEach((id) => qc.invalidateQueries({ queryKey: keys.person(id) }));
      qc.invalidateQueries({ queryKey: ["notes"] });
      qc.invalidateQueries({ queryKey: keys.peopleIndex() });
    };
    const idle = () => !qc.getMutationCache().getAll().some((m) => isNoteWrite(m) && m.state.status === "pending");
    if (idle()) return run();
    const unsubscribe = qc.getMutationCache().subscribe(() => idle() && run());
    syncWaiting = unsubscribe;
  }, delay);
}
