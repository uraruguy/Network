"use client";
/**
 * /graph — who introduced whom. Same chrome as the globe (header, view switch, filter bar);
 * filtering is client-side over the cached people index so both views read the same URL params.
 */
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Share2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FilterBar } from "@/components/filters/FilterBar";
import { MapHeader } from "@/components/globe/MapHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { filterPeople, filtersFromParams, filtersToParams, isEmpty, type PeopleFilters } from "@/lib/filters/people-filters";
import { useIsPhone } from "@/lib/media";
import { useGraph, useProfile } from "@/lib/queries/misc";
import { usePeopleIndex } from "@/lib/queries/people";
import { GraphPersonPanel } from "./GraphPersonPanel";
import { filterGraph } from "./graph-data";

const NetworkGraph = dynamic(() => import("./NetworkGraph").then((m) => m.NetworkGraph), { ssr: false });

function writeFilters(next: PeopleFilters) {
  const qs = filtersToParams(next, new URLSearchParams(window.location.search)).toString();
  window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
}

export function GraphView() {
  const params = useSearchParams();
  const filters = useMemo(() => filtersFromParams(new URLSearchParams(params.toString())), [params]);
  const { data: graph, isPending } = useGraph();
  const { data: index } = usePeopleIndex();
  const { data: profile } = useProfile();
  const [selected, setSelected] = useState<string | null>(null);
  const phone = useIsPhone();

  const people = useMemo(() => index ?? [], [index]);
  const filtered = useMemo(() => {
    if (!graph) return { nodes: [], links: [] };
    if (isEmpty(filters) || !index) return graph;
    return filterGraph(graph, new Set(filterPeople(people, filters).map((p) => p.id)));
  }, [graph, index, people, filters]);

  const root = useRef<HTMLDivElement>(null);
  const header = useRef<HTMLDivElement>(null);
  const chrome = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0, top: 96, bottom: 0 });

  useEffect(() => {
    const r = root.current, h = header.current, c = chrome.current;
    if (!r || !h || !c) return;
    const measure = () => {
      const next = {
        w: Math.round(r.clientWidth),
        h: Math.round(r.clientHeight),
        top: Math.round(h.getBoundingClientRect().bottom - r.getBoundingClientRect().top),
        bottom: Math.round(c.getBoundingClientRect().height),
      };
      setBox((prev) => (prev.w === next.w && prev.h === next.h && prev.top === next.top && prev.bottom === next.bottom ? prev : next));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(r);
    ro.observe(h);
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  const sel = filtered.nodes.find((n) => n.id === selected) ?? null;
  const introductions = filtered.links.filter((l) => l.kind === "introduced").length;
  const subtitle = isPending
    ? "Loading…"
    : `${filtered.nodes.length.toLocaleString()} ${filtered.nodes.length === 1 ? "person" : "people"} · ${introductions} ${introductions === 1 ? "introduction" : "introductions"}`;

  return (
    <div
      ref={root}
      className="relative h-dvh w-full overflow-hidden bg-bg bg-[radial-gradient(ellipse_80%_70%_at_50%_46%,var(--accent-50),var(--bg)_72%)] dark:bg-[radial-gradient(ellipse_80%_70%_at_50%_46%,var(--bg-3),var(--bg)_72%)]"
    >
      <div className="absolute inset-0">
        {box.w > 0 && !isPending && (
          <NetworkGraph
            nodes={filtered.nodes}
            links={filtered.links}
            meName={profile?.displayName ?? "You"}
            selectedId={selected}
            onSelect={setSelected}
            width={box.w}
            height={box.h}
            insets={{ top: box.top + 12, bottom: box.bottom + 12, left: 16, right: 16 }}
          />
        )}
      </div>

      <div ref={chrome} aria-hidden className="pointer-events-none invisible absolute inset-x-0 bottom-0 h-[var(--chrome-bottom)]" />

      <MapHeader ref={header} title="Graph" subtitle={subtitle}>
        <FilterBar variant="map" filters={filters} onChange={writeFilters} people={people} showSearch />
      </MapHeader>

      {!isPending && (graph?.nodes.length ?? 0) === 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[calc(var(--chrome-bottom)+24px)] z-10 flex justify-center px-4 lg:bottom-10">
          <div className="glass-map specular pointer-events-auto w-full max-w-sm rounded-xl px-5">
            <EmptyState compact icon={<Share2 />} title="Your map of introductions" description="Set “Introduced by” on people and the web of who-knows-who draws itself." />
          </div>
        </div>
      )}

      <GraphPersonPanel
        node={sel}
        links={filtered.links}
        nodes={filtered.nodes}
        phone={phone}
        top={box.top + 8}
        onSelect={setSelected}
      />
    </div>
  );
}
