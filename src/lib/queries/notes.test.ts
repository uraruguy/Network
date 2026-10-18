import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeDraftNote, pendingNoteWrites, type NoteDoc } from "@/lib/notes/cache";
import { contentVersion } from "@/lib/notes/version";
import { keys } from "./keys";
import { registerNoteMutations, restoreNote, saveNote } from "./notes";
import { personWrites, registerPeopleMutations } from "./people";
import type { PersonDetailApi, RecentNoteApi } from "./types";

vi.mock("@/components/ui/Toast", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), undo: vi.fn(), success: vi.fn() }) }));

const P1 = "11111111-1111-4111-8111-111111111111";
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function person(id: string): PersonDetailApi {
  return { id, displayName: "Ana", avatarUrl: null, notes: [], notesCount: 0, reminders: [] } as unknown as PersonDetailApi;
}

describe("conditional content saves (another device edited the note)", () => {
  let qc: QueryClient;
  const calls: { url: string; method: string; body: Record<string, unknown> | null }[] = [];
  const opened = { ...makeDraftNote({ id: "n1", personId: P1, contentText: "Coffee", contentMd: "Coffee" }), localOnly: false, contentJson: null };
  const fromMac = { ...opened, title: "Coffee", contentText: "Coffee with Mac edits", contentMd: "Coffee with Mac edits", updatedAt: "2026-10-18T10:00:00.000Z" };

  beforeEach(() => {
    calls.length = 0;
    qc = new QueryClient({ defaultOptions: { mutations: { networkMode: "offlineFirst" } } });
    registerNoteMutations(qc);
    qc.setQueryData(keys.person(P1), person(P1));
    qc.setQueryData(keys.note("n1"), opened);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
      calls.push({ url, method: init?.method ?? "GET", body });
      if (url === "/api/notes/n1") return json(409, { error: "conflict", message: "Changed elsewhere", note: fromMac });
      return json(201, { ...makeDraftNote({ id: url.split("/").pop()!, personId: P1 }), ...body, localOnly: undefined });
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    qc.clear();
  });

  it("sends the version it was based on and remembers it for a resend", () => {
    void saveNote(qc, "n1", { personId: P1, title: "Coffee", contentText: "Coffee!", contentMd: "Coffee!", baseVersions: [contentVersion(opened)] }, { content: true });
    expect(qc.getQueryData<NoteDoc>(keys.note("n1"))!.baseVersions).toEqual([contentVersion(opened), contentVersion({ contentText: "Coffee!", contentMd: "Coffee!" })]);
  });

  it("on 409 keeps both: the note takes the other version, the local words become a new note", async () => {
    void saveNote(qc, "n1", { personId: P1, title: "Coffee", contentText: "Coffee, typed on the iPhone", contentMd: "Coffee, typed on the iPhone", baseVersions: [contentVersion(opened)] }, { content: true });
    await vi.waitFor(() => expect(calls.some((c) => c.url !== "/api/notes/n1")).toBe(true));

    expect(calls[0]!.body!.baseVersions).toEqual([contentVersion(opened)]);
    const original = qc.getQueryData<NoteDoc>(keys.note("n1"))!;
    expect(original.contentText).toBe("Coffee with Mac edits");
    expect(original.syncPending).toBeFalsy();
    expect(original.forkedTo).toBeUndefined(); // not on screen: a toast tells instead
    const copy = calls.find((c) => c.url !== "/api/notes/n1")!;
    expect(copy.method).toBe("PUT");
    expect(copy.body).toMatchObject({ personId: P1, contentText: "Coffee, typed on the iPhone", pinned: false });
    expect(copy.body!.baseVersions).toBeUndefined(); // a create
    const notes = qc.getQueryData<PersonDetailApi>(keys.person(P1))!.notes.map((n) => n.excerpt);
    expect(notes).toEqual(expect.arrayContaining(["Coffee with Mac edits", "Coffee, typed on the iPhone"]));
  });
});

describe("restoring a deleted note", () => {
  let qc: QueryClient;
  beforeEach(() => {
    qc = new QueryClient();
    registerNoteMutations(qc);
    qc.setQueryData(keys.note("n2"), { ...makeDraftNote({ id: "n2", personId: P1, contentText: "Last words" }), localOnly: false, deleted: true });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(200, { ...makeDraftNote({ id: "n2", personId: P1, contentText: "Last words" }), localOnly: undefined }));
  });
  afterEach(() => vi.restoreAllMocks());

  it("never sends blank editor content — the server's last words come back instead", async () => {
    void restoreNote(qc, "n2", P1, { title: null, contentText: "  ", contentMd: "", contentJson: null });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe("/api/notes/n2/restore");
  });

  it("restores with the editor's words when it has some", async () => {
    void restoreNote(qc, "n2", P1, { title: "New", contentText: "New words", contentMd: "New words", contentJson: null });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe("/api/notes/n2");
    expect(JSON.parse(String(init!.body))).toMatchObject({ restore: true, contentText: "New words" });
    expect(pendingNoteWrites(qc, "n2").length).toBeLessThanOrEqual(1);
  });
});

describe("removing a person", () => {
  it("takes their follow-ups and notes off Today right away", () => {
    const qc = new QueryClient({ defaultOptions: { mutations: { networkMode: "offlineFirst" } } });
    registerPeopleMutations(qc);
    vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {}));
    qc.setQueryData(keys.reminders(), [
      { id: "r1", personId: P1, dueAt: "2026-10-18T09:00:00.000Z" },
      { id: "r2", personId: "other", dueAt: "2026-10-18T09:00:00.000Z" },
    ]);
    qc.setQueryData<RecentNoteApi[]>(keys.recentNotes(), [{ id: "n1", personId: P1 } as RecentNoteApi, { id: "n2", personId: "other" } as RecentNoteApi]);
    personWrites(qc).remove(P1);
    expect(qc.getQueryData<{ id: string }[]>(keys.reminders())!.map((r) => r.id)).toEqual(["r2"]);
    expect(qc.getQueryData<RecentNoteApi[]>(keys.recentNotes())!.map((n) => n.id)).toEqual(["n2"]);
    vi.restoreAllMocks();
  });
});
