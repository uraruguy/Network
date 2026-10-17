import { describe, expect, it } from "vitest";
import { planLeave, planSave, type AutosaveState, type ContentSnapshot } from "./autosave";

const draft: AutosaveState = { persisted: false, lastSaved: null };
const saved: AutosaveState = { persisted: true, lastSaved: "v1" };
const content = (text: string, fingerprint = text, title: string | null = text.split("\n")[0] || null): ContentSnapshot => ({ text, title, fingerprint });
const empty = content("", "empty", null);

describe("planSave", () => {
  it("never saves an empty note (new or existing)", () => {
    expect(planSave(draft, empty)).toEqual({ kind: "skip", reason: "empty" });
    expect(planSave(saved, empty)).toEqual({ kind: "skip", reason: "empty" });
    expect(planSave(draft, content("   \n  ", "ws", null))).toEqual({ kind: "skip", reason: "empty" });
  });

  it("creates on the first words of a draft", () => {
    expect(planSave(draft, content("Coffee"))).toEqual({ kind: "save", isNew: true });
  });

  it("updates a saved note only when the content changed", () => {
    expect(planSave(saved, content("Coffee", "v1"))).toEqual({ kind: "skip", reason: "unchanged" });
    expect(planSave(saved, content("Coffee and cake", "v2"))).toEqual({ kind: "save", isNew: false });
  });
});

describe("planLeave", () => {
  it("leaves nothing behind for an untouched new note", () => {
    expect(planLeave(draft, empty)).toBe("discard-draft");
    expect(planLeave(draft, null)).toBe("discard-draft");
  });

  it("soft-deletes a saved note that was emptied", () => {
    expect(planLeave(saved, empty)).toBe("delete-empty");
  });

  it("flushes unsaved changes, and does nothing when everything is saved", () => {
    expect(planLeave(saved, content("Changed", "v2"))).toBe("save");
    expect(planLeave(saved, content("Same", "v1"))).toBe("nothing");
    expect(planLeave(draft, content("Typed fast"))).toBe("save");
  });

  it("does nothing for a saved note whose editor never loaded", () => {
    expect(planLeave(saved, null)).toBe("nothing");
  });
});
