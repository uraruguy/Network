import { onlineManager, QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components/ui/Toast";
import { makeDraftNote, type NoteDoc } from "@/lib/notes/cache";
import { keys } from "./keys";
import { OfflineMergeError, personWrites, registerPeopleMutations, type MergeReport } from "./people";
import type { PersonDetailApi, PersonIndexRow } from "./types";

/** The merge mutation default: online-only, and what the cache looks like afterwards. */

vi.mock("@/components/ui/Toast", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), undo: vi.fn(), success: vi.fn() }) }));

const KEEP = "11111111-1111-4111-8111-111111111111";
const DROP = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const row = (id: string, displayName: string) => ({ id, displayName, avatarUrl: null, headline: null, company: null, categoryIds: [], activityIds: [], tagIds: [] }) as unknown as PersonIndexRow;
const detail = (id: string, over: Partial<PersonDetailApi> = {}) =>
  ({ ...row(id, "Vid Čanabrian"), notes: [], notesCount: 0, reminders: [], homeLocation: null, ...over }) as unknown as PersonDetailApi;
const report: MergeReport = { keep: { id: KEEP, name: "Vid Čanabrian" }, drop: { id: DROP, name: "Vid Canabrian" }, fields: ["company"], moved: { notes: 2 }, factsMerged: false, dryRun: false };

describe("merging two people", () => {
  let qc: QueryClient;
  type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  let fetchMock: ReturnType<typeof vi.fn<Fetch>>;

  beforeEach(() => {
    qc = new QueryClient();
    registerPeopleMutations(qc);
    qc.setQueryData(keys.peopleIndex(), [row(KEEP, "Vid Čanabrian"), row(DROP, "Vid Canabrian"), row(OTHER, "Ana")]);
    qc.setQueryData(keys.person(KEEP), detail(KEEP));
    qc.setQueryData(keys.person(DROP), detail(DROP));
    qc.setQueryData([...keys.personNotes(DROP), "summary"], { pages: [], pageParams: [] });
    qc.setQueryData(keys.note("n-drop"), makeDraftNote({ id: "n-drop", personId: DROP }));
    qc.setQueryData(keys.note("n-other"), makeDraftNote({ id: "n-other", personId: OTHER }));
    fetchMock = vi.fn<Fetch>(async () => json(200, { person: detail(KEEP, { company: "PackOpti", notesCount: 2 }), report }));
    vi.spyOn(globalThis, "fetch").mockImplementation(fetchMock);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(toast.error).mockClear();
    onlineManager.setOnline(true);
    qc.clear();
  });

  it("posts { into }, then the kept person replaces both cards in the cache", async () => {
    const r = await personWrites(qc).merge(DROP, KEEP);
    expect(r.report.moved.notes).toBe(2);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect([url, init?.method, JSON.parse(String(init?.body))]).toEqual([`/api/people/${DROP}/merge`, "POST", { into: KEEP }]);

    expect(qc.getQueryData<PersonIndexRow[]>(keys.peopleIndex())!.map((p) => p.id)).toEqual([KEEP, OTHER]);
    expect(qc.getQueryData<PersonDetailApi>(keys.person(KEEP))!.company).toBe("PackOpti");
    expect(qc.getQueryData(keys.person(DROP))).toBeUndefined();
    expect(qc.getQueryData([...keys.personNotes(DROP), "summary"])).toBeUndefined();
    // An open note of the duplicate now belongs to the kept person (a later save can't move it back).
    expect(qc.getQueryData<NoteDoc>(keys.note("n-drop"))!.personId).toBe(KEEP);
    expect(qc.getQueryData<NoteDoc>(keys.note("n-other"))!.personId).toBe(OTHER);
  });

  it("leaves the duplicate's profile to the page still showing it, until that page lets go", async () => {
    const observer = new QueryObserver(qc, { queryKey: keys.person(DROP), enabled: false });
    const unsubscribe = observer.subscribe(() => {});
    await personWrites(qc).merge(DROP, KEEP);
    expect(qc.getQueryData(keys.person(DROP))).toBeDefined();
    unsubscribe();
    expect(qc.getQueryData(keys.person(DROP))).toBeUndefined();
  });

  it("fails loudly offline — never queued, nothing sent, nothing changed", async () => {
    onlineManager.setOnline(false);
    await expect(personWrites(qc).merge(DROP, KEEP)).rejects.toBeInstanceOf(OfflineMergeError);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Couldn’t merge", { description: "You’re offline. Merging needs a connection." });
    expect(qc.getQueryData<PersonIndexRow[]>(keys.peopleIndex())).toHaveLength(3);
    expect(qc.getMutationCache().getAll().every((m) => m.state.status === "error")).toBe(true);
  });

  it("is not retried when the server refuses", async () => {
    fetchMock.mockImplementation(async () => json(404, { error: "not_found", message: "Both people must exist and not be deleted" }));
    await expect(personWrites(qc).merge(DROP, KEEP)).rejects.toThrow(/must exist/);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(qc.getQueryData(keys.person(DROP))).toBeDefined();
  });
});
