"use client";
/**
 * /globe — an Apple-Maps-style planet of the people you know.
 *
 * URL is the source of truth: people filters (`?q=&cat=&w=&act=&tag=`, shared with /people and
 * /graph) and the selected city (`?city=<locationId>`). Updates go through
 * `history.replaceState`, which Next syncs into `useSearchParams` — no router round trip and no
 * state-mirroring effects. The map itself is a client-only chunk (MapCanvas).
 */
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MapPinOff, SearchX, UserPlus } from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import type { PaddingOptions } from "maplibre-gl";
import { FilterBar } from "@/components/filters/FilterBar";
import { buttonVariants, GlassButton } from "@/components/glass/GlassButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { EMPTY_FILTERS, filterPeople, filtersFromParams, filtersToParams, isEmpty, type Facet, type PeopleFilters } from "@/lib/filters/people-filters";
import { useIsPhone } from "@/lib/media";
import { useCacheReady } from "@/lib/offline/useCacheReady";
import { useProfile } from "@/lib/queries/misc";
import { usePeopleIndex } from "@/lib/queries/people";
import { useActivities } from "@/lib/queries/taxonomy";
import { cn } from "@/lib/utils";
import { CityPanel, type ActivityLookup } from "./CityPanel";
import { GlobeControls } from "./GlobeControls";
import { GlobeSkeleton } from "./GlobeSkeleton";
import { MapHeader } from "./MapHeader";
import { PersonPeek } from "./PersonPeek";
import { buildArcCollection, buildCityData, citiesBounds, peopleCentroid, type LngLatPair } from "./globe-data";
import type { MapHandle } from "./MapCanvas";

const MapCanvas = dynamic(() => import("./MapCanvas"), { ssr: false, loading: () => <GlobeSkeleton /> });

/** The city facet is the globe's selection, so the filter bar offers everything else. */
const GLOBE_FACETS: Facet[] = ["category", "warmth", "activity", "tag"];
const FALLBACK_CENTER: LngLatPair = [14.5, 46];
const CITY_ZOOM = 10.5;
const HOME_ZOOM = 9;
const PANEL_WIDTH = 360;

/** Write the URL in place: filters (minus the city facet) + the selected city. */
function writeUrl(filters: PeopleFilters, city: string | null) {
  const next = filtersToParams({ ...filters, locationIds: [] }, new URLSearchParams(window.location.search));
  if (city) next.set("city", city);
  else next.delete("city");
  const qs = next.toString();
  window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export function GlobeView() {
  const params = useSearchParams();
  const filters = useMemo<PeopleFilters>(() => ({ ...filtersFromParams(new URLSearchParams(params.toString())), locationIds: [] }), [params]);
  const selectedId = params.get("city");

  const peopleQuery = usePeopleIndex();
  const profileQuery = useProfile();
  const { data: activityRows } = useActivities();
  // Cached data only once it may render (see useCacheReady), so the server HTML and the
  // hydration render agree (skeleton, "Loading…"); client navigations get it straight away.
  const cacheReady = useCacheReady();
  const peopleData = cacheReady ? peopleQuery.data : undefined;
  const peoplePending = !cacheReady || peopleQuery.isPending;
  const people = useMemo(() => peopleData ?? [], [peopleData]);
  const filtered = useMemo(() => filterPeople(people, filters), [people, filters]);
  const { collection, groups, withoutCity } = useMemo(() => buildCityData(filtered), [filtered]);
  const activities = useMemo<ActivityLookup>(() => new Map((activityRows ?? []).map((a) => [a.id, a])), [activityRows]);

  const homeLoc = (cacheReady ? profileQuery.data?.homeLocation : null) ?? null;
  const home = useMemo(() => (homeLoc ? { lat: homeLoc.lat, lng: homeLoc.lng } : null), [homeLoc]);
  const [arcsOn, setArcsOn] = useState(false);
  const arcs = useMemo(() => (arcsOn && home ? buildArcCollection(home, groups.values()) : null), [arcsOn, home, groups]);

  const selected = selectedId ? (groups.get(selectedId) ?? null) : null;
  const single = selected && selected.people.length === 1 ? selected : null;
  const multi = selected && selected.people.length > 1 ? selected : null;

  const phone = useIsPhone();
  const root = useRef<HTMLDivElement>(null);
  const header = useRef<HTMLDivElement>(null);
  const chrome = useRef<HTMLDivElement>(null);
  const handle = useRef<MapHandle | null>(null);
  const [insets, setInsets] = useState({ top: 96, bottom: 0, width: 0, height: 0 });
  const [mapReady, setMapReady] = useState(false);

  // Overlay geometry → camera padding (the globe centres in what the chrome leaves free).
  useEffect(() => {
    const r = root.current, h = header.current, c = chrome.current;
    if (!r || !h || !c) return;
    const measure = () => {
      const top = Math.round(h.getBoundingClientRect().bottom - r.getBoundingClientRect().top);
      const bottom = Math.round(c.getBoundingClientRect().height);
      setInsets((prev) =>
        prev.top === top && prev.bottom === bottom && prev.width === r.clientWidth && prev.height === r.clientHeight
          ? prev
          : { top, bottom, width: r.clientWidth, height: r.clientHeight },
      );
    };
    const ro = new ResizeObserver(measure);
    ro.observe(r);
    ro.observe(h);
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  const padding = (panel: "none" | "city" | "peek" = "none"): PaddingOptions => {
    const base = { top: insets.top + 12, bottom: insets.bottom + 12, left: 16, right: 16 };
    if (panel === "none") return base;
    if (phone) return { ...base, bottom: panel === "city" ? Math.round(insets.height * 0.35) + 12 : insets.bottom + 230 };
    return { ...base, right: PANEL_WIDTH + 40 };
  };

  const planetCenter = (): LngLatPair => (home ? [home.lng, home.lat] : (peopleCentroid(groups.values()) ?? FALLBACK_CENTER));

  /* ---------- selection ---------- */
  const flyTo = (id: string) => {
    const g = groups.get(id);
    if (!g) return;
    handle.current?.flyToCity(g.location, { zoom: CITY_ZOOM, padding: padding(g.people.length === 1 ? "peek" : "city") });
  };
  const selectCity = (id: string | null) => {
    writeUrl(filters, id);
    if (id) flyTo(id);
  };

  // Deep link (`/globe?city=…`): fly there once the map and the people are in.
  const initialFly = useRef(false);
  const flyToInitial = useEffectEvent(() => {
    initialFly.current = true;
    if (selectedId && groups.has(selectedId)) flyTo(selectedId);
  });
  useEffect(() => {
    if (mapReady && peopleQuery.isSuccess && !initialFly.current) flyToInitial();
  }, [mapReady, peopleQuery.isSuccess]);

  /* ---------- filters ---------- */
  const fitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(fitTimer.current), []);
  const onFiltersChange = (next: PeopleFilters) => {
    const keepCity = selectedId && filterPeople(people, next).some((p) => p.homeLocation?.id === selectedId) ? selectedId : null;
    writeUrl(next, keepCity);
    clearTimeout(fitTimer.current);
    if (isEmpty({ ...next, locationIds: [] }) || keepCity) return;
    // Show where the matches are (debounced so typing a search doesn't swing the camera).
    fitTimer.current = setTimeout(() => {
      const bounds = citiesBounds(buildCityData(filterPeople(people, next)).groups.values());
      if (bounds) handle.current?.fitPeople(bounds, { padding: padding(), maxZoom: 6 });
    }, 450);
  };
  const clearFilters = () => onFiltersChange(EMPTY_FILTERS);

  /* ---------- moving flag (glass overlays drop their blur while the map moves) ---------- */
  const onMovingChange = (moving: boolean) => {
    const el = root.current;
    if (el && el.hasAttribute("data-map-moving") !== moving) el.toggleAttribute("data-map-moving", moving);
  };

  const dataReady = !peoplePending && !profileQuery.isPending;
  const onMap = filtered.length - withoutCity;
  const located = useMemo(() => people.reduce((n, p) => n + (p.homeLocation ? 1 : 0), 0), [people]);
  const filtering = !isEmpty(filters);
  const cityCount = plural(groups.size, "city", "cities");
  const subtitle = peoplePending
    ? "Loading…"
    : filtering
      ? `${onMap.toLocaleString()} of ${plural(located, "person", "people")} · ${cityCount}`
      : `${plural(onMap, "person", "people")} · ${cityCount}`;

  return (
    <div ref={root} className="relative h-dvh w-full overflow-hidden bg-bg">
      {dataReady ? (
        <MapCanvas
          handle={handle}
          cities={collection}
          groups={groups}
          arcs={arcs}
          home={home}
          selectedId={selected ? selectedId : null}
          initialCenter={planetCenter()}
          padding={padding()}
          rotationPaused={!!selected}
          onCityPress={selectCity}
          onMovingChange={onMovingChange}
          onReady={() => setMapReady(true)}
        />
      ) : (
        <GlobeSkeleton />
      )}

      {/* Bottom chrome probe: the phone tab bar's height (0 on desktop). */}
      <div ref={chrome} aria-hidden className="pointer-events-none invisible absolute inset-x-0 bottom-0 h-[var(--chrome-bottom)]" />

      <MapHeader ref={header} title="Globe" subtitle={subtitle}>
        <FilterBar variant="map" filters={filters} onChange={onFiltersChange} people={people} facets={GLOBE_FACETS} showSearch />
        {withoutCity > 0 && !peoplePending && (
          <Link
            href="/people"
            className="glass-map specular pointer-events-auto inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-footnote font-medium text-fg-2 hover:text-fg"
          >
            <MapPinOff className="size-3.5" aria-hidden />
            {plural(withoutCity, "person", "people")} without a city
          </Link>
        )}
      </MapHeader>

      <GlobeControls
        className={cn(
          "absolute right-3 bottom-[calc(var(--chrome-bottom)+12px)] z-10 transition-[right,opacity] duration-300 ease-ios lg:right-6 lg:bottom-6",
          !phone && multi && "right-[calc(360px+24px)] lg:right-[calc(360px+40px)]",
          !phone && single && "sm:right-[calc(340px+24px)] lg:right-[calc(340px+40px)]",
          // On phones the sheet / card owns the bottom of the screen.
          phone && selected && "pointer-events-none opacity-0",
        )}
        onZoomIn={() => handle.current?.zoomBy(1)}
        onZoomOut={() => handle.current?.zoomBy(-1)}
        onHome={home ? () => handle.current?.flyToCity(home, { zoom: HOME_ZOOM, padding: padding() }) : null}
        onPlanet={() => {
          writeUrl(filters, null);
          handle.current?.resetPlanet(planetCenter(), padding());
        }}
        arcs={arcsOn}
        onArcsChange={home ? setArcsOn : null}
      />

      <CityPanel group={multi} activities={activities} phone={phone} onClose={() => selectCity(null)} top={insets.top + 8} />
      <PersonPeek group={single} activities={activities} onClose={() => selectCity(null)} top={insets.top + 8} />

      {dataReady && groups.size === 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[calc(var(--chrome-bottom)+24px)] z-10 flex justify-center px-4 lg:bottom-10">
          <div className="glass-map specular pointer-events-auto w-full max-w-sm rounded-xl px-5">
            {filtering && located > 0 ? (
              <EmptyState
                compact
                icon={<SearchX />}
                title="No one here matches"
                description="Nobody with a home city fits these filters."
                action={
                  <GlassButton variant="soft" size="sm" onClick={clearFilters}>
                    Clear filters
                  </GlassButton>
                }
              />
            ) : (
              <EmptyState
                compact
                icon={<UserPlus />}
                title="No cities yet"
                description="Give people a “Lives in” city and they’ll appear on the globe."
                action={
                  <Link href="/people?new=1" className={buttonVariants({ variant: "primary", size: "sm" })}>
                    Add a person
                  </Link>
                }
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
