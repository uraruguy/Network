import { onlineManager, QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { keys } from "@/lib/queries/keys";
import { registerNoteMutations, saveNote, startNoteDraft } from "@/lib/queries/notes";
import type { PersonDetailApi } from "@/lib/queries/types";
import { makeDraftNote, noteScopeId, pendingNoteWrites, removeNoteFromLists, sortSummaries, toSummary, upsertNoteInLists, type NoteDoc } from "./cache";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";

function person(id: string, notes: ReturnType<typeof toSummary>[] = []): PersonDetailApi {
  return { id, displayName: id === P1 ? "Ana" : "Bo", avatarUrl: null, notes, notesCount: notes.length } as unknown as PersonDetailApi;
}

const summary = (id: string, over: Partial<ReturnType<typeof toSummary>> = {}) =>
  toSummary({ ...makeDraftNote({ id, personId: P1, contentText: `${id} body` }), ...over } as NoteDoc);

describe("list cache patches", () => {
  let qc: QueryClient;
  beforeEach(() => {
    qc = new QueryClient();
    qc.setQueryData(keys.person(P1), person(P1, [summary("old", { occurredAt: "2026-01-01T10:00:00.000Z" as unknown as Date })]));
    qc.setQueryData(keys.person(P2), person(P2));
  });

  it("adds a new note to the person page, counts it once, keeps pinned first", () => {
    upsertNoteInLists(qc, summary("new", { occurredAt: "2026-02-01T10:00:00.000Z" as unknown as Date }), { isNew: true });
    upsertNoteInLists(qc, summary("new", { title: "Edited", occurredAt: "2026-02-01T10:00:00.000Z" as unknown as Date }), { isNew: true });
    const p = qc.getQueryData<PersonDetailApi>(keys.person(P1))!;
    expect(p.notes.map((n) => n.id)).toEqual(["new", "old"]);
    expect(p.notes[0]!.title).toBe("Edited");
    expect(p.notesCount).toBe(2);

    upsertNoteInLists(qc, { ...p.notes[1]!, pinned: true });
    expect(qc.getQueryData<PersonDetailApi>(keys.person(P1))!.notes.map((n) => n.id)).toEqual(["old", "new"]);
  });

  it("moves a note between people", () => {
    upsertNoteInLists(qc, { ...summary("old"), personId: P2 }, { fromPersonId: P1 });
    expect(qc.getQueryData<PersonDetailApi>(keys.person(P1))!).toMatchObject({ notes: [], notesCount: 0 });
    expect(qc.getQueryData<PersonDetailApi>(keys.person(P2))!.notes.map((n) => n.id)).toEqual(["old"]);
    expect(qc.getQueryData<PersonDetailApi>(keys.person(P2))!.notesCount).toBe(1);
  });

  it("removes a note and adjusts the count", () => {
    removeNoteFromLists(qc, "old", P1, { countDelta: -1 });
    expect(qc.getQueryData<PersonDetailApi>(keys.person(P1))!).toMatchObject({ notes: [], notesCount: 0 });
  });

  it("sorts pinned first, then newest", () => {
    const list = sortSummaries([
      { id: "a", pinned: false, occurredAt: "2026-01-02" },
      { id: "b", pinned: true, occurredAt: "2025-01-01" },
      { id: "c", pinned: false, occurredAt: "2026-03-01" },
    ]);
    expect(list.map((n) => n.id)).toEqual(["b", "c", "a"]);
  });
});

describe("drafts and offline writes", () => {
  let qc: QueryClient;
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { mutations: { networkMode: "offlineFirst" } } });
    registerNoteMutations(qc);
    qc.setQueryData(keys.person(P1), person(P1));
    onlineManager.setOnline(false);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
  });
  afterEach(() => {
    onlineManager.setOnline(true);
    vi.restoreAllMocks();
    qc.clear();
  });

  it("starting a note only seeds a local draft", () => {
    const id = startNoteDraft(qc, { personId: P1 });
    const doc = qc.getQueryData<NoteDoc>(keys.note(id))!;
    expect(doc).toMatchObject({ id, personId: P1, localOnly: true, title: null, kind: "note" });
    expect(doc.contentJson).toMatchObject({ content: [{ type: "heading", attrs: { level: 1 } }, { type: "paragraph" }] });
    expect(fetch).not.toHaveBeenCalled();
    expect(qc.getQueryData<PersonDetailApi>(keys.person(P1))!.notes).toHaveLength(0);
  });

  it("a save offline patches every list immediately and queues in the note's scope", async () => {
    const id = startNoteDraft(qc, { personId: P1 });
    void saveNote(qc, id, { personId: P1, title: "Coffee", contentText: "Coffee\nTalked about Lisbon", contentMd: "# Coffee", contentJson: null }, { content: true, isNew: true });
    await vi.waitFor(() => expect(pendingNoteWrites(qc, id)[0]?.state.isPaused).toBe(true), { timeout: 4000 });

    expect(qc.getQueryData<NoteDoc>(keys.note(id))).toMatchObject({ title: "Coffee", localOnly: true });
    const p = qc.getQueryData<PersonDetailApi>(keys.person(P1))!;
    expect(p.notesCount).toBe(1);
    expect(p.notes[0]).toMatchObject({ id, title: "Coffee", excerpt: "Coffee\nTalked about Lisbon" });
    expect(pendingNoteWrites(qc, id)[0]!.options.scope).toEqual({ id: noteScopeId(id) });
  });

  it("newer autosaves replace queued ones, but the create is kept", async () => {
    const id = startNoteDraft(qc, { personId: P1 });
    void saveNote(qc, id, { personId: P1, title: "v1", contentText: "v1", contentMd: "v1" }, { content: true, isNew: true });
    void saveNote(qc, id, { personId: P1, title: "v2", contentText: "v2", contentMd: "v2" }, { content: true });
    void saveNote(qc, id, { personId: P1, title: "v3", contentText: "v3", contentMd: "v3" }, { content: true });
    await vi.waitFor(() => expect(pendingNoteWrites(qc, id).every((m) => m.state.isPaused)).toBe(true), { timeout: 4000 });

    const titles = pendingNoteWrites(qc, id).map((m) => (m.state.variables as { body: { title: string } }).body.title);
    expect(titles).toEqual(["v1", "v3"]);
    expect(qc.getQueryData<NoteDoc>(keys.note(id))!.title).toBe("v3");
    expect(qc.getQueryData<PersonDetailApi>(keys.person(P1))!.notesCount).toBe(1);
  });
});
