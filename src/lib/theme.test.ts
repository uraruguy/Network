// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MQListener = (e: { matches: boolean }) => void;
let systemDark = false;
const mqListeners = new Set<MQListener>();

function installMatchMedia() {
  window.matchMedia = ((query: string) => ({
    get matches() {
      return query.includes("dark") ? systemDark : false;
    },
    media: query,
    addEventListener: (_: string, l: MQListener) => mqListeners.add(l),
    removeEventListener: (_: string, l: MQListener) => mqListeners.delete(l),
  })) as unknown as typeof window.matchMedia;
}

function setSystemDark(v: boolean) {
  systemDark = v;
  mqListeners.forEach((l) => l({ matches: v }));
}

describe("theme store", () => {
  beforeEach(() => {
    vi.resetModules();
    systemDark = false;
    mqListeners.clear();
    installMatchMedia();
    localStorage.clear();
    document.documentElement.className = "";
    document.head.innerHTML = '<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f7fbfb"><meta name="theme-color" media="(prefers-color-scheme: dark)" content="#070f10">';
  });
  afterEach(() => localStorage.clear());

  it("resolves system preference and follows OS changes live", async () => {
    const t = await import("./theme");
    const off = t.subscribeTheme(() => {});
    expect(t.getThemePreference()).toBe("system");
    expect(t.getResolvedTheme()).toBe("light");

    setSystemDark(true);
    expect(t.getResolvedTheme()).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => expect(m.content).toBe(t.THEME_COLOR.dark));

    setSystemDark(false);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    off();
    expect(mqListeners.size).toBe(0);
  });

  it("an explicit preference overrides the OS and persists", async () => {
    const t = await import("./theme");
    const listener = vi.fn();
    const off = t.subscribeTheme(listener);
    t.setThemePreference("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(listener).toHaveBeenCalled();
    expect(t.getResolvedTheme()).toBe("dark");

    setSystemDark(false); // OS says light — preference wins
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    t.setThemePreference("system");
    expect(localStorage.getItem("theme")).toBeNull();
    expect(t.getResolvedTheme()).toBe("light");
    off();
  });

  it("follows other tabs via the storage event", async () => {
    const t = await import("./theme");
    const listener = vi.fn();
    const off = t.subscribeTheme(listener);
    localStorage.setItem("theme", "dark");
    window.dispatchEvent(new StorageEvent("storage", { key: "theme", newValue: "dark" }));
    expect(listener).toHaveBeenCalled();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    off();
  });
});
