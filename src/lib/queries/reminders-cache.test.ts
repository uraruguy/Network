import { describe, expect, it } from "vitest";
import { applyChange, earliestDue, findIn, matchesFilter, type ReminderLike } from "./reminders-cache";

const r = (id: string, dueAt: string, extra: Partial<ReminderLike> = {}): ReminderLike => ({
  id,
  personId: "p1",
  dueAt,
  recurrence: "none",
  recurrenceDays: null,
  message: null,
  status: "pending",
  ...extra,
});

const list = [r("a", "2026-10-10T07:00:00.000Z"), r("b", "2026-10-20T07:00:00.000Z"), r("c", "2026-11-01T07:00:00.000Z", { personId: "p2" })];
const ids = (l: { id: string }[]) => l.map((x) => x.id);

describe("matchesFilter", () => {
  it("filters by person and due window", () => {
    expect(matchesFilter(list[0]!, {})).toBe(true);
    expect(matchesFilter(list[2]!, { personId: "p1" })).toBe(false);
    expect(matchesFilter(list[1]!, { until: "2026-10-15T00:00:00.000Z" })).toBe(false);
    expect(matchesFilter(list[0]!, { until: "2026-10-15T00:00:00.000Z" })).toBe(true);
  });
});

describe("applyChange", () => {
  it("removes", () => {
    expect(ids(applyChange(list, { type: "remove", id: "b" }))).toEqual(["a", "c"]);
  });

  it("patches and re-sorts by due date", () => {
    const out = applyChange(list, { type: "patch", id: "a", patch: { dueAt: "2026-12-01T07:00:00.000Z" } });
    expect(ids(out)).toEqual(["b", "c", "a"]);
    expect(out.find((x) => x.id === "a")!.dueAt).toBe("2026-12-01T07:00:00.000Z");
  });

  it("drops rows that leave a list's window or get completed", () => {
    const today = { until: "2026-10-25T00:00:00.000Z" };
    expect(ids(applyChange(list.slice(0, 2), { type: "patch", id: "a", patch: { dueAt: "2026-11-30T07:00:00.000Z" } }, today))).toEqual(["b"]);
    expect(ids(applyChange(list, { type: "patch", id: "b", patch: { status: "done" } }))).toEqual(["a", "c"]);
  });

  it("upserts new rows in order, skipping ones outside the filter", () => {
    const fresh = r("n", "2026-10-15T07:00:00.000Z");
    expect(ids(applyChange(list, { type: "upsert", reminder: fresh }))).toEqual(["a", "n", "b", "c"]);
    expect(ids(applyChange(list, { type: "upsert", reminder: { ...fresh, personId: "p9" } }, { personId: "p1" }))).toEqual(["a", "b", "c"]);
  });

  it("upsert replaces an existing row and keeps fields the change doesn't carry", () => {
    const rich = [{ ...list[0]!, person: { id: "p1", displayName: "Ana" } }];
    const out = applyChange(rich, { type: "upsert", reminder: { ...list[0]!, message: "Coffee" } });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ message: "Coffee", person: { displayName: "Ana" } });
  });

  it("upsert with a row builder that can't build skips the insert", () => {
    expect(ids(applyChange(list, { type: "upsert", reminder: r("x", "2026-10-11T00:00:00.000Z") }, {}, () => null))).toEqual(["a", "b", "c"]);
  });

  it("upserting a done reminder removes it", () => {
    expect(ids(applyChange(list, { type: "upsert", reminder: { ...list[0]!, status: "done" } }))).toEqual(["b", "c"]);
  });
});

describe("earliestDue / findIn", () => {
  it("earliestDue mirrors the next-follow-up trigger", () => {
    expect(earliestDue([])).toBeNull();
    expect(earliestDue([list[1]!, list[0]!])).toBe("2026-10-10T07:00:00.000Z");
  });

  it("findIn returns the first hit across lists", () => {
    expect(findIn([undefined, [list[1]!], list], "b")).toBe(list[1]);
    expect(findIn([list], "zzz")).toBeUndefined();
  });
});
