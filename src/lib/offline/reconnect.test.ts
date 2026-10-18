import { describe, expect, it, vi } from "vitest";
import { reloadWhenOnline } from "./reconnect";

function fakeWindow(onLine: boolean, visibilityState: DocumentVisibilityState = "visible") {
  const doc = Object.assign(new EventTarget(), { visibilityState });
  const win = Object.assign(new EventTarget(), { navigator: { onLine }, document: doc, location: {} });
  return win as unknown as Window & { navigator: { onLine: boolean }; document: { visibilityState: DocumentVisibilityState } };
}

describe("reloadWhenOnline", () => {
  it("reloads when the network comes back", () => {
    const win = fakeWindow(false);
    const reload = vi.fn();
    reloadWhenOnline(win, reload);
    win.navigator.onLine = true;
    win.dispatchEvent(new Event("online"));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads when the app returns to the foreground already online, not while offline", () => {
    const win = fakeWindow(false, "hidden");
    const reload = vi.fn();
    reloadWhenOnline(win, reload);
    win.document.visibilityState = "visible";
    win.document.dispatchEvent(new Event("visibilitychange"));
    expect(reload).not.toHaveBeenCalled();
    win.navigator.onLine = true;
    win.document.visibilityState = "hidden";
    win.document.dispatchEvent(new Event("visibilitychange"));
    expect(reload).not.toHaveBeenCalled();
    win.document.visibilityState = "visible";
    win.document.dispatchEvent(new Event("visibilitychange"));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads once, however many signals arrive", () => {
    const win = fakeWindow(true);
    const reload = vi.fn();
    reloadWhenOnline(win, reload);
    win.dispatchEvent(new Event("online"));
    win.document.dispatchEvent(new Event("visibilitychange"));
    win.dispatchEvent(new Event("online"));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("stops listening after cleanup", () => {
    const win = fakeWindow(true);
    const reload = vi.fn();
    reloadWhenOnline(win, reload)();
    win.dispatchEvent(new Event("online"));
    win.document.dispatchEvent(new Event("visibilitychange"));
    expect(reload).not.toHaveBeenCalled();
  });
});
