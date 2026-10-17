/**
 * One shared minute clock for the whole app.
 *
 * Every "5 min ago", "Overdue", "Today" label subscribes to the same store, so a list of 300
 * rows costs one timer, not 300. Ticks are aligned to wall-clock minute boundaries and pause
 * while the tab is hidden (an immediate tick on return catches up).
 */
import { useSyncExternalStore } from "react";

const MINUTE = 60_000;
/** Fire just after the boundary so formatted minutes have definitely rolled over. */
const SLACK = 50;

type Listener = () => void;

export function createMinuteClock(nowFn: () => number = Date.now) {
  let now = nowFn();
  const listeners = new Set<Listener>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const hasDocument = () => typeof document !== "undefined";
  const hidden = () => hasDocument() && document.visibilityState === "hidden";

  const clear = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const emit = () => {
    now = nowFn();
    listeners.forEach((l) => l());
  };

  const schedule = () => {
    clear();
    if (listeners.size === 0 || hidden()) return;
    const t = nowFn();
    timer = setTimeout(tick, MINUTE - (t % MINUTE) + SLACK);
  };

  function tick() {
    emit();
    schedule();
  }

  const onVisibility = () => {
    if (hidden()) clear();
    else tick();
  };

  return {
    subscribe(listener: Listener) {
      listeners.add(listener);
      if (listeners.size === 1) {
        if (hasDocument()) document.addEventListener("visibilitychange", onVisibility);
        // Catch up if the clock was idle (no subscribers) for a while.
        if (Math.floor(nowFn() / MINUTE) !== Math.floor(now / MINUTE)) now = nowFn();
        schedule();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          clear();
          if (hasDocument()) document.removeEventListener("visibilitychange", onVisibility);
        }
      };
    },
    getSnapshot: () => now,
    /** Force a tick (e.g. after the device wakes). */
    refresh: tick,
    /** Test helper. */
    get listenerCount() {
      return listeners.size;
    },
  };
}

export const minuteClock = createMinuteClock();

/** Server render + hydration use the module-load time; RelativeTime suppresses the mismatch. */
const serverNow = Date.now();
const getServerSnapshot = () => serverNow;

/**
 * Current time (epoch ms), refreshed once a minute on the minute.
 * The argument is accepted for compatibility with the v1 `useNow(intervalMs)` and ignored.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useNow(_intervalMs?: number): number {
  return useSyncExternalStore(minuteClock.subscribe, minuteClock.getSnapshot, getServerSnapshot);
}
