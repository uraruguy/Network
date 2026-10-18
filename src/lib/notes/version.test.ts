import { describe, expect, it } from "vitest";
import { contentVersion, extendChain, isStaleWrite, MAX_BASE_VERSIONS } from "./version";

const v = (text: string, md = text) => contentVersion({ contentText: text, contentMd: md });

describe("contentVersion", () => {
  it("is stable for the same stored content and changes with text or Markdown", () => {
    expect(v("Coffee")).toBe(v("Coffee"));
    expect(v("Coffee")).not.toBe(v("Coffee!"));
    expect(v("Coffee", "**Coffee**")).not.toBe(v("Coffee", "Coffee"));
    // Text and Markdown can't bleed into each other.
    expect(contentVersion({ contentText: "ab", contentMd: "c" })).not.toBe(contentVersion({ contentText: "a", contentMd: "bc" }));
  });

  it("treats missing fields as empty", () => {
    expect(contentVersion({})).toBe(contentVersion({ contentText: "", contentMd: "" }));
    expect(contentVersion({ contentText: null, contentMd: null })).toBe(contentVersion({}));
  });
});

describe("extendChain", () => {
  it("appends new versions once", () => {
    expect(extendChain(["a"], "b")).toEqual(["a", "b"]);
    expect(extendChain(["a", "b"], "b")).toEqual(["a", "b"]);
  });

  it("keeps the opened version and the newest ones when capping", () => {
    let chain = ["opened"];
    for (let i = 0; i < 40; i++) chain = extendChain(chain, `v${i}`);
    expect(chain).toHaveLength(MAX_BASE_VERSIONS);
    expect(chain[0]).toBe("opened");
    expect(chain.at(-1)).toBe("v39");
  });
});

describe("isStaleWrite (server)", () => {
  const stored = { contentText: "Mac edit", contentMd: "Mac edit" };

  it("refuses a save based on content that changed meanwhile", () => {
    expect(isStaleWrite({ baseVersions: [v("cached")], current: stored, incoming: { contentText: "iPhone", contentMd: "iPhone" } })).toBe(true);
  });

  it("accepts a save based on the stored content, or on any earlier save of the same queue", () => {
    expect(isStaleWrite({ baseVersions: [v("Mac edit")], current: stored, incoming: { contentText: "next", contentMd: "next" } })).toBe(false);
    expect(isStaleWrite({ baseVersions: [v("opened"), v("Mac edit")], current: stored, incoming: { contentText: "next", contentMd: "next" } })).toBe(false);
  });

  it("accepts a replay of a save that already landed", () => {
    expect(isStaleWrite({ baseVersions: [v("older")], current: stored, incoming: { ...stored } })).toBe(false);
  });

  it("never guards unconditional writes (creates, pins, restores)", () => {
    expect(isStaleWrite({ current: stored, incoming: { contentText: "x" } })).toBe(false);
    expect(isStaleWrite({ baseVersions: [], current: stored, incoming: { contentText: "x" } })).toBe(false);
  });
});
