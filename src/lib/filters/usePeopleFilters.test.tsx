// @vitest-environment happy-dom
import { act, createElement, useImperativeHandle, type Ref } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QUERY_URL_DELAY, usePeopleFilters, usePeopleSort, type PeopleFiltersState } from "./usePeopleFilters";
import type { SortKey } from "./sort";

// Next's shallow routing: history.replaceState updates useSearchParams. Emulate that contract.
vi.mock("next/navigation", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  const replace = window.history.replaceState.bind(window.history);
  window.history.replaceState = (...args: Parameters<History["replaceState"]>) => {
    replace(...args);
    notify();
  };
  window.addEventListener("popstate", notify);
  return {
    useSearchParams: () => {
      const search = React.useSyncExternalStore(
        (cb) => {
          listeners.add(cb);
          return () => listeners.delete(cb);
        },
        () => window.location.search,
      );
      return React.useMemo(() => new URLSearchParams(search), [search]);
    },
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Handle = { state: PeopleFiltersState; sort: [SortKey, (s: SortKey) => void] };

function Probe({ handle }: { handle: Ref<Handle> }) {
  const state = usePeopleFilters();
  const sort = usePeopleSort();
  useImperativeHandle(handle, () => ({ state, sort }));
  return null;
}

let root: Root;
const handle: { current: Handle | null } = { current: null };
const h = () => handle.current!;

function mount(url: string) {
  window.history.replaceState(null, "", url);
  const el = document.createElement("div");
  document.body.append(el);
  root = createRoot(el);
  act(() => root.render(createElement(Probe, { handle })));
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});

describe("usePeopleFilters", () => {
  it("reads filters from the URL", () => {
    mount("/people?q=%C5%BDan&cat=a,b&w=inner&sort=name");
    expect(h().state.filters).toMatchObject({ q: "Žan", categoryIds: ["a", "b"], warmth: ["inner"] });
    expect(h().sort[0]).toBe("name");
  });

  it("writes facet changes to the URL at once, keeping unrelated params", () => {
    mount("/people?sort=name&new=1");
    act(() => h().state.setFilters((f) => ({ ...f, tagIds: ["t1", "t2"] })));
    act(() => vi.advanceTimersByTime(0));
    expect(window.location.search).toBe("?sort=name&new=1&tag=t1,t2");
    expect(h().state.filters.tagIds).toEqual(["t1", "t2"]);
  });

  it("updates the search instantly but writes it to the URL after a pause", () => {
    mount("/people");
    act(() => h().state.setQuery("an"));
    act(() => h().state.setQuery("ana"));
    expect(h().state.filters.q).toBe("ana");
    act(() => vi.advanceTimersByTime(QUERY_URL_DELAY - 50));
    expect(window.location.search).toBe("");
    act(() => vi.advanceTimersByTime(60));
    expect(window.location.search).toBe("?q=ana");
  });

  it("flushes a pending search on the next press (tapping a result keeps it in history)", () => {
    mount("/people");
    act(() => h().state.setQuery("rok"));
    act(() => {
      document.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(window.location.search).toBe("?q=rok");
  });

  it("adopts URL changes made elsewhere (back/forward, links)", () => {
    mount("/people?w=inner");
    act(() => {
      window.history.pushState(null, "", "/people?act=x&q=bob");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(h().state.filters).toMatchObject({ q: "bob", activityIds: ["x"], warmth: [] });
  });

  it("clear() drops facets and (unless kept) the search", () => {
    mount("/people?q=x&cat=a&city=lj");
    act(() => h().state.clear({ keepQuery: true }));
    act(() => vi.advanceTimersByTime(0));
    expect(window.location.search).toBe("?q=x");
    act(() => h().state.clear());
    act(() => vi.advanceTimersByTime(QUERY_URL_DELAY));
    expect(window.location.search).toBe("");
  });
});

describe("usePeopleSort", () => {
  it("writes ?sort= and omits the default", () => {
    mount("/people?cat=a");
    act(() => h().sort[1]("followup"));
    expect(window.location.search).toBe("?cat=a&sort=followup");
    expect(h().sort[0]).toBe("followup");
    act(() => h().sort[1]("recent"));
    expect(window.location.search).toBe("?cat=a");
  });
});
