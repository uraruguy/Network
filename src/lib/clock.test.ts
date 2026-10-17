// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMinuteClock } from "./clock";

describe("minute clock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 17, 10, 15, 42));
  });
  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });

  it("ticks on minute boundaries with one timer for many subscribers", () => {
    const clock = createMinuteClock();
    const a = vi.fn();
    const b = vi.fn();
    const ua = clock.subscribe(a);
    const ub = clock.subscribe(b);
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(17_000); // 10:15:59
    expect(a).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_100); // just past 10:16:00
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(new Date(clock.getSnapshot()).getMinutes()).toBe(16);

    vi.advanceTimersByTime(60_000);
    expect(a).toHaveBeenCalledTimes(2);
    expect(new Date(clock.getSnapshot()).getMinutes()).toBe(17);

    ua();
    ub();
    expect(clock.listenerCount).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps a stable snapshot between ticks", () => {
    const clock = createMinuteClock();
    const u = clock.subscribe(() => {});
    const s1 = clock.getSnapshot();
    vi.advanceTimersByTime(5_000);
    expect(clock.getSnapshot()).toBe(s1);
    u();
  });

  it("pauses while hidden and catches up on return", () => {
    const clock = createMinuteClock();
    const fn = vi.fn();
    const u = clock.subscribe(fn);

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(vi.getTimerCount()).toBe(0);

    vi.advanceTimersByTime(5 * 60_000);
    expect(fn).not.toHaveBeenCalled();

    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(fn).toHaveBeenCalledTimes(1); // immediate catch-up tick
    expect(new Date(clock.getSnapshot()).getMinutes()).toBe(20);
    expect(vi.getTimerCount()).toBe(1);
    u();
  });
});
