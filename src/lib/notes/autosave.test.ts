import { describe, expect, it } from "vitest";
import { initialChain, planLeave, planSave, planServerDoc, type AutosaveState, type ContentSnapshot } from "./autosave";
import { contentVersion } from "./version";

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

describe("initialChain", () => {
  it("bases the first save on the version the editor opened", () => {
    const doc = { contentText: "Coffee", contentMd: "Coffee" };
    expect(initialChain(doc)).toEqual([contentVersion(doc)]);
  });

  it("is empty for a draft (its first save creates the note) and keeps a queued save's chain", () => {
    expect(initialChain({ localOnly: true, contentText: "", contentMd: "" })).toEqual([]);
    expect(initialChain({ baseVersions: ["v1", "v2"], contentText: "x" })).toEqual(["v1", "v2"]);
  });
});

describe("planServerDoc", () => {
  it("recognises our own save landing", () => {
    expect(planServerDoc(["v1", "v2"], "v2", false)).toBe("confirm");
    expect(planServerDoc(["v1", "v2"], "v2", true)).toBe("confirm");
  });

  it("adopts another device's newer version when nothing here is unsaved (stale cache on open)", () => {
    expect(planServerDoc(["cached"], "from-mac", false)).toBe("adopt");
  });

  it("keeps unsaved local words (the next save is refused and both versions are kept)", () => {
    expect(planServerDoc(["cached"], "from-mac", true)).toBe("keep");
  });
});
