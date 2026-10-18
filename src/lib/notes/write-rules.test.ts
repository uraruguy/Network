import { describe, expect, it } from "vitest";
import { contentVersion } from "./version";
import { isBlankNote, planNoteWrite, type StoredNoteState } from "./write-rules";

const P = "11111111-1111-4111-8111-111111111111";
const row = (over: Partial<StoredNoteState> = {}): StoredNoteState => ({ title: "Coffee", contentText: "Coffee\nLisbon", contentMd: "# Coffee\n\nLisbon", deletedAt: null, ...over });

describe("isBlankNote", () => {
  it("needs a title, text or Markdown with words", () => {
    expect(isBlankNote({})).toBe(true);
    expect(isBlankNote({ title: "  ", contentText: "\n ", contentMd: "" })).toBe(true);
    expect(isBlankNote({ contentMd: "# Hi" })).toBe(false);
    expect(isBlankNote({ title: "Hi" })).toBe(false);
  });
});

describe("planNoteWrite — creating", () => {
  it("refuses an empty note and a note without a person", () => {
    expect(planNoteWrite(null, { personId: P })).toEqual({ kind: "invalid", message: "A note needs a title or some text" });
    expect(planNoteWrite(null, { personId: P, title: null, contentText: " ", contentMd: "" })).toMatchObject({ kind: "invalid" });
    expect(planNoteWrite(null, { contentText: "Hi" })).toEqual({ kind: "invalid", message: "personId is required to create a note" });
  });

  it("creates a note with words", () => {
    expect(planNoteWrite(null, { personId: P, contentText: "Hi", contentMd: "Hi" })).toEqual({ kind: "create" });
  });
});

describe("planNoteWrite — updating", () => {
  it("soft-deletes instead of storing a blank note (like clearing it in the app)", () => {
    expect(planNoteWrite(row(), { title: null, contentText: "", contentMd: "" })).toEqual({ kind: "delete-empty" });
  });

  it("applies metadata and partial content writes that keep words", () => {
    expect(planNoteWrite(row(), { personId: P })).toEqual({ kind: "update", keepContent: false }); // a move or pin
    expect(planNoteWrite(row(), { title: null })).toEqual({ kind: "update", keepContent: false }); // text remains
  });

  it("answers gone for a deleted note unless restoring", () => {
    expect(planNoteWrite(row({ deletedAt: new Date() }), { contentText: "x" })).toEqual({ kind: "gone" });
  });

  it("never revives blank content: a restore with an empty editor brings the last words back", () => {
    const deleted = row({ deletedAt: new Date() });
    expect(planNoteWrite(deleted, { restore: true, title: null, contentText: "", contentMd: "" })).toEqual({ kind: "update", keepContent: true });
    expect(planNoteWrite(deleted, { restore: true, contentText: "New words", contentMd: "New words" })).toEqual({ kind: "update", keepContent: false });
    expect(planNoteWrite(row({ deletedAt: new Date(), title: null, contentText: "", contentMd: "" }), { restore: true, contentText: "" })).toMatchObject({ kind: "invalid" });
  });

  it("refuses a content save based on content that changed elsewhere", () => {
    const base = [contentVersion({ contentText: "Coffee", contentMd: "# Coffee" })];
    expect(planNoteWrite(row(), { contentText: "Coffee!", contentMd: "# Coffee!", baseVersions: base })).toEqual({ kind: "conflict" });
    const current = [contentVersion(row())];
    expect(planNoteWrite(row(), { contentText: "Coffee!", contentMd: "# Coffee!", baseVersions: current })).toEqual({ kind: "update", keepContent: false });
  });

  it("checks for a conflict before blanking (a stale clear doesn't delete newer words)", () => {
    expect(planNoteWrite(row(), { contentText: "", contentMd: "", title: null, baseVersions: ["stale"] })).toEqual({ kind: "conflict" });
  });
});
