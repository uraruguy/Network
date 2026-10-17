import { describe, expect, it, vi } from "vitest";
import { createConfirmStore } from "./confirm";

describe("confirm store", () => {
  it("queues requests and resolves them in order", async () => {
    const store = createConfirmStore();
    const listener = vi.fn();
    store.subscribe(listener);

    const first = store.confirm({ title: "Delete Anna?", destructive: true, confirmLabel: "Delete" });
    const second = store.confirm("Discard changes?");
    expect(listener).toHaveBeenCalledTimes(2);

    const q = store.getSnapshot();
    expect(q.map((r) => r.title)).toEqual(["Delete Anna?", "Discard changes?"]);
    expect(q[0]).toMatchObject({ destructive: true, confirmLabel: "Delete" });

    store.resolve(q[0]!.id, true);
    await expect(first).resolves.toBe(true);
    expect(store.getSnapshot().map((r) => r.title)).toEqual(["Discard changes?"]);

    store.resolve(store.getSnapshot()[0]!.id, false);
    await expect(second).resolves.toBe(false);
    expect(store.getSnapshot()).toHaveLength(0);
  });

  it("snapshots are immutable between changes (useSyncExternalStore-safe)", () => {
    const store = createConfirmStore();
    const a = store.getSnapshot();
    expect(store.getSnapshot()).toBe(a);
    void store.confirm("x");
    expect(store.getSnapshot()).not.toBe(a);
  });

  it("ignores unknown ids and double answers", async () => {
    const store = createConfirmStore();
    const p = store.confirm("Sure?");
    const id = store.getSnapshot()[0]!.id;
    store.resolve(999, true);
    expect(store.getSnapshot()).toHaveLength(1);
    store.resolve(id, true);
    store.resolve(id, false);
    await expect(p).resolves.toBe(true);
  });

  it("clear() cancels everything", async () => {
    const store = createConfirmStore();
    const a = store.confirm("a");
    const b = store.confirm("b");
    store.clear();
    await expect(Promise.all([a, b])).resolves.toEqual([false, false]);
    expect(store.getSnapshot()).toHaveLength(0);
  });

  it("unsubscribe stops notifications", () => {
    const store = createConfirmStore();
    const fn = vi.fn();
    const off = store.subscribe(fn);
    off();
    void store.confirm("x");
    expect(fn).not.toHaveBeenCalled();
  });
});
