import { onlineManager, QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { pendingNoteWrites } from "@/lib/notes/cache";
import { keys } from "./keys";
import { registerNoteMutations, saveNote } from "./notes";
import { personWrites, registerPeopleMutations } from "./people";
import type { PersonDetailApi } from "./types";
import { ParentPendingError, pickScope, queuedWrites, waitForParent, writeEntity } from "./write-order";

describe("writeEntity", () => {
  it("names the entity from the key root and the variables' id (or a bare id)", () => {
    expect(writeEntity(["people", "create"], { id: "p1", displayName: "Ana" })).toBe("person:p1");
    expect(writeEntity(["people", "delete"], "p1")).toBe("person:p1");
    expect(writeEntity(["notes", "upsert"], { id: "n1", body: {} })).toBe("note:n1");
    expect(writeEntity(["reminders", "action"], { id: "r1", action: "done" })).toBe("reminder:r1");
    expect(writeEntity(["activities", "create"], { id: "a1", name: "Chess" })).toBe("activity:a1");
  });

  it("ignores untracked roots and writes without an id", () => {
    expect(writeEntity(["tags", "merge"], { id: "t1" })).toBeNull();
    expect(writeEntity(["activities", "reorder"], ["a1", "a2"])).toBeNull();
    expect(writeEntity(undefined, { id: "x" })).toBeNull();
  });
});

describe("pickScope", () => {
  it("uses the entity's own scope when nothing it depends on is queued", () => {
    expect(pickScope([], "note:n1", ["person:p1"])).toBe("note:n1");
    expect(pickScope([{ entity: "person:p2", scope: "person:p2" }], "note:n1", ["person:p1"])).toBe("note:n1");
  });

  it("queues behind a parent whose create hasn't reached the server", () => {
    expect(pickScope([{ entity: "person:p1", scope: "person:p1" }], "note:n1", ["person:p1"])).toBe("person:p1");
    // A person created with a brand-new activity waits in the activity's scope…
    expect(pickScope([{ entity: "activity:a1", scope: "activities:create" }], "person:p1", ["activity:a1"])).toBe("activities:create");
    // …and so does a note for that person, transitively.
    const queued = [
      { entity: "activity:a1", scope: "activities:create" },
      { entity: "person:p1", scope: "activities:create" },
    ];
    expect(pickScope(queued, "note:n1", ["person:p1"])).toBe("activities:create");
  });

  it("keeps an entity's writes together once they sit in a joined scope", () => {
    const queued = [
      { entity: "person:p1", scope: "person:p1" },
      { entity: "note:n1", scope: "person:p1" },
    ];
    // The person landed meanwhile; the note's queued save is still in the person's scope.
    expect(pickScope(queued.slice(1), "note:n1", ["person:p1"])).toBe("person:p1");
  });

  it("takes the first dep that is queued (note before person for a follow-up)", () => {
    const queued = [
      { entity: "person:p1", scope: "person:p1" },
      { entity: "note:n1", scope: "note:n1" },
    ];
    expect(pickScope(queued, "reminder:r1", ["note:n1", "person:p1"])).toBe("note:n1");
    expect(pickScope(queued, "reminder:r1", [null, "person:p1"])).toBe("person:p1");
  });
});

describe("waitForParent", () => {
  it("makes a 404 retryable only while the parent is queued", () => {
    const qc = new QueryClient();
    const notFound = new ApiError(404, "not_found", "Not found");
    expect(waitForParent(qc, notFound, "person:p1")).toBe(notFound);
    qc.getMutationCache().build(qc, { mutationKey: ["people", "create"], scope: { id: "person:p1" } }, { status: "pending", variables: { id: "p1" }, isPaused: true } as never);
    expect(waitForParent(qc, notFound, "person:p1")).toBeInstanceOf(ParentPendingError);
    expect(waitForParent(qc, new ApiError(422, "invalid", "Nope"), "person:p1")).not.toBeInstanceOf(ParentPendingError);
  });
});

describe("offline: a note for a person created offline", () => {
  let qc: QueryClient;
  beforeEach(() => {
    // As in the app (lib/offline/queryClient): failed writes retry, and pause while offline.
    qc = new QueryClient({ defaultOptions: { mutations: { networkMode: "offlineFirst", retry: 3 } } });
    registerPeopleMutations(qc);
    registerNoteMutations(qc);
    onlineManager.setOnline(false);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
  });
  afterEach(() => {
    onlineManager.setOnline(true);
    vi.restoreAllMocks();
    qc.clear();
  });

  it("queues its first save behind the person's create, so it can't 404 on resume", async () => {
    const personId = personWrites(qc).create({ displayName: "Ana" });
    expect(qc.getQueryData<PersonDetailApi>(keys.person(personId))?.displayName).toBe("Ana");

    void saveNote(qc, "n1", { personId, title: "Coffee", contentText: "Coffee", contentMd: "Coffee" }, { content: true, isNew: true });
    await vi.waitFor(() => expect(pendingNoteWrites(qc, "n1")[0]?.state.isPaused).toBe(true), { timeout: 4000 });

    expect(pendingNoteWrites(qc, "n1")[0]!.options.scope).toEqual({ id: `person:${personId}` });
    expect(queuedWrites(qc).map((w) => w.entity)).toEqual([`person:${personId}`, "note:n1"]);

    // Later saves of the same note follow it there, even if the person had landed meanwhile.
    void saveNote(qc, "n1", { personId, title: "Coffee", contentText: "Coffee and cake", contentMd: "Coffee and cake" }, { content: true });
    expect(pendingNoteWrites(qc, "n1").map((m) => m.options.scope?.id)).toEqual([`person:${personId}`, `person:${personId}`]);
  });

  it("queues a person save behind a brand-new activity it links", async () => {
    qc.getMutationCache().build(qc, { mutationKey: ["activities", "create"], scope: { id: "activities:create" } }).execute({ id: "a1", name: "Chess" }).catch(() => {});
    const personId = personWrites(qc).create({ displayName: "Bo", activityIds: ["a1"] });
    await vi.waitFor(() => expect(queuedWrites(qc)).toHaveLength(2));
    expect(queuedWrites(qc)).toEqual([
      { entity: "activity:a1", scope: "activities:create" },
      { entity: `person:${personId}`, scope: "activities:create" },
    ]);
  });
});
