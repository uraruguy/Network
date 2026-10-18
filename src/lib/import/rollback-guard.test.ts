import { describe, expect, it } from "vitest";
import { rollbackBlockers, type BlockerRef, type CommitLogRow } from "./rollback-guard";

const rows: CommitLogRow[] = [
  { tableName: "people", op: "insert", rowKey: { id: "p1" }, before: null },
  { tableName: "people", op: "insert", rowKey: { id: "p2" }, before: null },
  { tableName: "notes", op: "insert", rowKey: { id: "n1" }, before: null },
  { tableName: "reminders", op: "insert", rowKey: { id: "r1" }, before: null },
  { tableName: "person_categories", op: "insert", rowKey: { person_id: "p1", category_id: "c1" }, before: null },
  { tableName: "person_tags", op: "insert", rowKey: { person_id: "p1", tag_id: "t1" }, before: null },
  { tableName: "person_activities", op: "insert", rowKey: { person_id: "p1", activity_id: "a1" }, before: null },
  { tableName: "note_mentions", op: "insert", rowKey: { note_id: "old-note", person_id: "p1" }, before: null },
  { tableName: "people", op: "update", rowKey: { id: "q1" }, before: { introduced_by_id: null } },
];

const ref = (kind: BlockerRef["kind"], other: string, personId = "p1"): BlockerRef => ({ kind, personId, other });

describe("rollbackBlockers", () => {
  it("everything the commit wrote is safe to delete", () => {
    const refs = [ref("note", "n1"), ref("reminder", "r1"), ref("category", "c1"), ref("tag", "t1"), ref("activity", "a1"), ref("mention", "old-note"), ref("mention", "n1"), ref("introduced", "q1"), ref("introduced", "p2")];
    expect(rollbackBlockers(["p1", "p2"], rows, refs).size).toBe(0);
  });

  it("blocks on what the user added by hand", () => {
    const refs = [ref("note", "mine"), ref("reminder", "r9"), ref("category", "c2"), ref("tag", "t2"), ref("activity", "a2"), ref("mention", "my-note"), ref("introduced", "q2"), ref("chat", "th1"), ref("tag", "t2", "p2")];
    const out = rollbackBlockers(["p1", "p2"], rows, refs);
    expect(out.get("p1")).toEqual(["note mine", "reminder r9", "category c2", "tag t2", "activity a2", "mentioned in note my-note", "introduced person q2", "chat thread th1"]);
    expect(out.get("p2")).toEqual(["tag t2"]);
  });

  it("ignores references to people the rollback doesn't delete", () => {
    expect(rollbackBlockers(["p1"], rows, [ref("note", "mine", "existing")]).size).toBe(0);
  });
});
