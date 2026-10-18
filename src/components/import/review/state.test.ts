import { describe, expect, it } from "vitest";
import {
  classifyTarget,
  currentId,
  decisionOf,
  formatTimeLeft,
  initialReviewState,
  keyToCommand,
  reviewProgress,
  reviewReducer,
  swipeOutcome,
  type ReviewEvent,
  type ReviewState,
} from "./state";

const run = (s: ReviewState, ...evs: ReviewEvent[]) => evs.reduce(reviewReducer, s);
const start = () => initialReviewState(["a", "b", "c", "d"], 0);

describe("review state machine", () => {
  it("decides and advances to the next undecided card", () => {
    const s = run(start(), { type: "decide", id: "a", action: "approve", now: 4000 });
    expect(currentId(s)).toBe("b");
    expect(decisionOf(s, "a")).toBe("approve");
    expect(s.motion).toBe("approve");
    expect(s.durations).toEqual([4]);
  });

  it("finishes when every card is decided", () => {
    const s = run(
      start(),
      { type: "decide", id: "a", action: "approve", now: 1 },
      { type: "decide", id: "b", action: "reject", now: 2 },
      { type: "decide", id: "c", action: "passerby", now: 3 },
      { type: "decide", id: "d", action: "merge", now: 4 },
    );
    expect(s.index).toBe(4);
    expect(currentId(s)).toBeNull();
    expect(reviewProgress(s).remaining).toBe(0);
  });

  it("undo pops the last decision and returns to that card", () => {
    const s = run(start(), { type: "decide", id: "a", action: "approve", now: 1 }, { type: "decide", id: "b", action: "reject", now: 2 }, { type: "undo", now: 3 });
    expect(currentId(s)).toBe("b");
    expect(decisionOf(s, "b")).toBeNull();
    expect(decisionOf(s, "a")).toBe("approve");
    expect(s.motion).toBe("back");
  });

  it("re-deciding a card logs a second entry; undo restores the first verdict", () => {
    let s = run(start(), { type: "decide", id: "a", action: "approve", now: 1 }, { type: "back", now: 2 });
    expect(currentId(s)).toBe("a");
    s = run(s, { type: "decide", id: "a", action: "reject", now: 3 });
    expect(decisionOf(s, "a")).toBe("reject");
    expect(currentId(s)).toBe("b");
    s = run(s, { type: "undo", now: 4 });
    expect(decisionOf(s, "a")).toBe("approve");
    expect(currentId(s)).toBe("a");
  });

  it("revert drops a refused decision and shows the card again", () => {
    const s = run(start(), { type: "decide", id: "a", action: "approve", now: 1 }, { type: "decide", id: "b", action: "approve", now: 2 }, { type: "revert", id: "a" });
    expect(decisionOf(s, "a")).toBeNull();
    expect(decisionOf(s, "b")).toBe("approve");
    expect(currentId(s)).toBe("a");
  });

  it("later postpones the card to the end of the queue", () => {
    const s = run(start(), { type: "later", now: 1 });
    expect(s.queue).toEqual(["b", "c", "d", "a"]);
    expect(currentId(s)).toBe("b");
    expect(s.motion).toBe("later");
  });

  it("later on the last undecided card keeps it", () => {
    const s = run(initialReviewState(["a", "b"]), { type: "decide", id: "a", action: "approve", now: 1 }, { type: "later", now: 2 });
    expect(currentId(s)).toBe("b");
    expect(decisionOf(s, "b")).toBeNull();
  });

  it("later on a decided card just moves forward", () => {
    const s = run(start(), { type: "decide", id: "a", action: "approve", now: 1 }, { type: "back", now: 2 }, { type: "later", now: 3 });
    expect(s.queue).toEqual(["a", "b", "c", "d"]);
    expect(currentId(s)).toBe("b");
  });

  it("decisions after going back resume at the first undecided card ahead", () => {
    const s = run(
      start(),
      { type: "decide", id: "a", action: "approve", now: 1 },
      { type: "decide", id: "b", action: "approve", now: 2 },
      { type: "jump", id: "a", now: 3 },
      { type: "decide", id: "a", action: "passerby", now: 4 },
    );
    expect(currentId(s)).toBe("c");
  });

  it("wraps around to postponed cards before finishing", () => {
    const s = run(initialReviewState(["a", "b", "c"]), { type: "later", now: 1 }, { type: "decide", id: "b", action: "approve", now: 2 }, { type: "decide", id: "c", action: "approve", now: 3 });
    expect(currentId(s)).toBe("a");
  });

  it("sync appends unseen ids without reordering, and wakes a finished stack", () => {
    let s = run(initialReviewState(["a"]), { type: "decide", id: "a", action: "approve", now: 1 });
    expect(currentId(s)).toBeNull();
    s = run(s, { type: "sync", ids: ["b", "a", "c"], now: 5 });
    expect(s.queue).toEqual(["a", "b", "c"]);
    expect(currentId(s)).toBe("b");
    expect(run(s, { type: "sync", ids: ["a", "b"] })).toBe(s);
  });

  it("back stops at the first card; forward stops at the end", () => {
    const s = start();
    expect(run(s, { type: "back", now: 1 })).toBe(s);
    const end = run(s, { type: "forward", now: 1 }, { type: "forward", now: 1 }, { type: "forward", now: 1 }, { type: "forward", now: 1 }, { type: "forward", now: 1 });
    expect(end.index).toBe(4);
  });

  it("ignores decisions for unknown ids", () => {
    const s = start();
    expect(run(s, { type: "decide", id: "zzz", action: "approve", now: 1 })).toBe(s);
  });
});

describe("progress", () => {
  it("counts decided people and estimates the time left from recent pace", () => {
    let s = initialReviewState(["a", "b", "c", "d", "e"], 0);
    expect(reviewProgress(s, 47)).toMatchObject({ decided: 0, total: 47, remaining: 47, secondsLeft: 47 * 6 });
    s = run(s, { type: "decide", id: "a", action: "approve", now: 3000 }, { type: "decide", id: "b", action: "approve", now: 6000 });
    const p = reviewProgress(s, 47);
    expect(p.decided).toBe(2);
    expect(p.remaining).toBe(45);
    expect(p.secondsLeft).toBe(45 * 3);
  });

  it("formats the time left", () => {
    expect(formatTimeLeft(0)).toBe("");
    expect(formatTimeLeft(40)).toBe("under a minute left");
    expect(formatTimeLeft(250)).toBe("about 4 min left");
  });
});

describe("keyboard shortcuts", () => {
  const k = (key: string, extra: Partial<Parameters<typeof keyToCommand>[0]> = {}) => keyToCommand({ key, ...extra }, "page");

  it("maps the review keys", () => {
    expect(k("a")).toEqual({ type: "approve" });
    expect(k("A")).toEqual({ type: "approve" });
    expect(k("Enter")).toEqual({ type: "approve" });
    expect(k("x")).toEqual({ type: "reject" });
    expect(k("p")).toEqual({ type: "passerby" });
    expect(k("m")).toEqual({ type: "merge" });
    expect(k("s")).toEqual({ type: "split" });
    expect(k("e")).toEqual({ type: "edit" });
    expect(k("j")).toEqual({ type: "later" });
    expect(k("ArrowRight")).toEqual({ type: "later" });
    expect(k("k")).toEqual({ type: "back" });
    expect(k("ArrowLeft")).toEqual({ type: "back" });
    expect(k("u")).toEqual({ type: "undo" });
    expect(k("z", { metaKey: true })).toEqual({ type: "undo" });
    expect(k("z", { ctrlKey: true })).toEqual({ type: "undo" });
    expect(k("?", { shiftKey: true })).toEqual({ type: "legend" });
    expect(k("3")).toEqual({ type: "category", index: 2 });
  });

  it("ignores keys while typing or with a dialog open", () => {
    expect(keyToCommand({ key: "a" }, "editable")).toBeNull();
    expect(keyToCommand({ key: "z", metaKey: true }, "editable")).toBeNull();
    expect(keyToCommand({ key: "a" }, "page", true)).toBeNull();
  });

  it("leaves Enter to focused buttons but keeps letters", () => {
    expect(keyToCommand({ key: "Enter" }, "interactive")).toBeNull();
    expect(keyToCommand({ key: "a" }, "interactive")).toEqual({ type: "approve" });
  });

  it("ignores other modifier combos, shifted letters, unknown keys and decision auto-repeat", () => {
    expect(k("a", { metaKey: true })).toBeNull();
    expect(k("z", { metaKey: true, shiftKey: true })).toBeNull();
    expect(k("a", { altKey: true })).toBeNull();
    expect(k("A", { shiftKey: true })).toBeNull();
    expect(k("8")).toBeNull();
    expect(k("q")).toBeNull();
    expect(k("a", { repeat: true })).toBeNull();
    expect(k("j", { repeat: true })).toEqual({ type: "later" });
  });

  it("classifies event targets", () => {
    const el = (tagName: string, extra: Record<string, unknown> = {}) => ({ tagName, getAttribute: (n: string) => (extra[n] as string) ?? null, ...extra });
    expect(classifyTarget(null)).toBe("page");
    expect(classifyTarget(el("DIV"))).toBe("page");
    expect(classifyTarget(el("INPUT"))).toBe("editable");
    expect(classifyTarget(el("INPUT", { type: "checkbox" }))).toBe("interactive");
    expect(classifyTarget(el("TEXTAREA"))).toBe("editable");
    expect(classifyTarget(el("DIV", { isContentEditable: true }))).toBe("editable");
    expect(classifyTarget(el("DIV", { role: "combobox" }))).toBe("editable");
    expect(classifyTarget(el("BUTTON"))).toBe("interactive");
    expect(classifyTarget(el("SPAN", { role: "switch" }))).toBe("interactive");
  });
});

describe("swipes", () => {
  const w = 360;
  it("approves on a long or fast right swipe", () => {
    expect(swipeOutcome({ x: 140, y: 10 }, { x: 0, y: 0 }, w)).toBe("approve");
    expect(swipeOutcome({ x: 50, y: 0 }, { x: 900, y: 0 }, w)).toBe("approve");
  });
  it("rejects on a left swipe", () => {
    expect(swipeOutcome({ x: -140, y: 0 }, { x: 0, y: 0 }, w)).toBe("reject");
    expect(swipeOutcome({ x: -50, y: 0 }, { x: -900, y: 0 }, w)).toBe("reject");
  });
  it("postpones on an upward swipe", () => {
    expect(swipeOutcome({ x: 10, y: -150 }, { x: 0, y: 0 }, w)).toBe("later");
    expect(swipeOutcome({ x: 0, y: -50 }, { x: 0, y: -900 }, w)).toBe("later");
  });
  it("snaps back on short or downward drags", () => {
    expect(swipeOutcome({ x: 60, y: 0 }, { x: 100, y: 0 }, w)).toBeNull();
    expect(swipeOutcome({ x: 0, y: 200 }, { x: 0, y: 900 }, w)).toBeNull();
    expect(swipeOutcome({ x: 0, y: -80 }, { x: 0, y: -100 }, w)).toBeNull();
  });
});
