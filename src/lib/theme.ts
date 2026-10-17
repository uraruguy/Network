"use client";
/**
 * Theme store: preference (system | light | dark) × live OS appearance → resolved theme.
 *
 * - The inline script in app/layout.tsx applies `.dark` before first paint (no flash).
 * - <ThemeSync/> (mounted once in Providers) keeps it in sync afterwards: OS changes are
 *   followed live while the preference is "system", other tabs are followed via `storage`.
 * - Components read `useResolvedTheme()` / `useDark()` and set it with `useThemePreference()`.
 */
import { useSyncExternalStore } from "react";
import { oklchToHex } from "@/lib/design/color";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "theme";
const MEDIA = "(prefers-color-scheme: dark)";

/** `<meta name="theme-color">` per theme — the canvas colour (--bg) as hex for Safari. */
export const THEME_COLOR: Record<ResolvedTheme, string> = {
  light: oklchToHex(0.985, 0.004, 200),
  dark: oklchToHex(0.16, 0.012, 215),
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function systemDark(): boolean {
  return typeof matchMedia !== "undefined" && matchMedia(MEDIA).matches;
}

export function getThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  return readPreference();
}

export function getResolvedTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  const pref = readPreference();
  return pref === "dark" || (pref === "system" && systemDark()) ? "dark" : "light";
}

/** Applies the resolved theme to <html> and the theme-color meta tags. Idempotent. */
export function applyTheme(resolved: ResolvedTheme = getResolvedTheme()) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
  const color = THEME_COLOR[resolved];
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  if (metas.length === 0) {
    const m = document.createElement("meta");
    m.name = "theme-color";
    m.content = color;
    document.head.appendChild(m);
  }
  // Next renders one tag per media query; when the user overrides the OS we pin both.
  metas.forEach((m) => {
    if (m.content !== color) m.content = color;
  });
}

export function setThemePreference(pref: ThemePreference) {
  try {
    if (pref === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {}
  applyTheme();
  emit();
}

let detach: (() => void) | null = null;

/** Subscribes to OS appearance + cross-tab preference changes (attached lazily, once). */
export function subscribeTheme(listener: () => void) {
  listeners.add(listener);
  if (!detach && typeof window !== "undefined") {
    const mq = matchMedia(MEDIA);
    const onChange = () => {
      applyTheme();
      emit();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === THEME_STORAGE_KEY) onChange();
    };
    mq.addEventListener("change", onChange);
    window.addEventListener("storage", onStorage);
    detach = () => {
      mq.removeEventListener("change", onChange);
      window.removeEventListener("storage", onStorage);
    };
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && detach) {
      detach();
      detach = null;
    }
  };
}

const serverPreference = (): ThemePreference => "system";
const serverResolved = (): ResolvedTheme => "light";

/** "light" | "dark" — what is actually on screen. ("light" during SSR/hydration.) */
export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribeTheme, getResolvedTheme, serverResolved);
}

/** Convenience boolean for canvas/WebGL consumers. */
export function useDark(): boolean {
  return useResolvedTheme() === "dark";
}

/** `[preference, setPreference]` for the Appearance setting. */
export function useThemePreference() {
  const pref = useSyncExternalStore(subscribeTheme, getThemePreference, serverPreference);
  return [pref, setThemePreference] as const;
}
