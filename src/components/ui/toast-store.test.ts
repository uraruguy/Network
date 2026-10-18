import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TOAST_DURATION, toast, toastManager } from "./toast-store";

type Event = { action: string; options: Record<string, unknown> };

function capture() {
  const events: Event[] = [];
  const off = toastManager[" subscribe"]((e) => events.push(e as Event));
  return { events, off };
}

describe("toast()", () => {
  let off: () => void = () => {};
  afterEach(() => off());

  it("adds a toast with defaults", () => {
    const c = capture();
    off = c.off;
    const id = toast("Saved");
    expect(typeof id).toBe("string");
    expect(c.events).toHaveLength(1);
    expect(c.events[0]!.action).toBe("add");
    expect(c.events[0]!.options).toMatchObject({ id, title: "Saved", type: "default", timeout: DEFAULT_TOAST_DURATION, priority: "low" });
  });

  it("passes description, duration and a custom id", () => {
    const c = capture();
    off = c.off;
    toast({ id: "sync", title: "Synced", description: "3 changes", duration: 2000 });
    expect(c.events[0]!.options).toMatchObject({ id: "sync", title: "Synced", description: "3 changes", timeout: 2000 });
  });

  it("error toasts are announced with high priority", () => {
    const c = capture();
    off = c.off;
    toast.error("Couldn't save", { description: "Offline" });
    expect(c.events[0]!.options).toMatchObject({ type: "error", priority: "high", description: "Offline" });
  });

  it("undo toasts carry an Undo action that runs the callback and closes the toast", () => {
    const c = capture();
    off = c.off;
    const onUndo = vi.fn();
    const id = toast.undo("Note deleted", onUndo);
    const opts = c.events[0]!.options as { type: string; timeout: number; actionProps: { children: string; onClick: () => void } };
    expect(opts.type).toBe("undo");
    expect(opts.timeout).toBe(6000);
    expect(opts.actionProps.children).toBe("Undo");

    opts.actionProps.onClick();
    expect(onUndo).toHaveBeenCalledOnce();
    expect(c.events.at(-1)).toMatchObject({ action: "close", options: { id } });
  });

  it("dismiss() closes by id or all", () => {
    const c = capture();
    off = c.off;
    toast.dismiss("abc");
    toast.dismiss();
    expect(c.events.map((e) => e.action)).toEqual(["close", "close"]);
  });

  it("generates unique ids", () => {
    const ids = new Set(Array.from({ length: 20 }, () => toast("x")));
    expect(ids.size).toBe(20);
  });
});
