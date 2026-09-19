"use client";
import { useEffect, useState, useSyncExternalStore } from "react";

/** Current time, refreshed every `intervalMs` — keeps "overdue"/"today" logic out of render-time Date.now() calls. */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

type Theme = "system" | "light" | "dark";
const listeners = new Set<() => void>();
const subscribeTheme = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const readTheme = (): Theme => {
  try {
    return (localStorage.getItem("theme") as Theme | null) ?? "system";
  } catch {
    return "system";
  }
};

/** Theme preference persisted in localStorage; applies the `.dark` class immediately. */
export function useTheme() {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "system" as Theme);
  const apply = (t: Theme) => {
    try {
      if (t === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", t);
    } catch {}
    const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    listeners.forEach((l) => l());
  };
  return [theme, apply] as const;
}
