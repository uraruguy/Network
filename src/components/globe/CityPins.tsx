"use client";
/**
 * HTML glass avatar pins for the cities that are on screen and NOT inside a cluster.
 * Clusters and far-away cities stay in WebGL (cheap); only what you can actually see gets DOM.
 *
 * The visible set is diffed on move (throttled) / moveend / source updates via
 * `querySourceFeatures`, capped at MAX_PINS nearest the centre. Each pin is a MapLibre Marker
 * whose element is a React portal target, so mount = add marker, unmount = remove marker.
 */
import { Marker, type Map as MapLibreMap } from "maplibre-gl";
import { motion } from "motion/react";
import { memo, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@/components/glass/Avatar";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { angularDistance, type CityGroup } from "./globe-data";
import { SRC } from "./map-style";
import styles from "./globe.module.css";

export const MAX_PINS = 80;
const THROTTLE_MS = 180;
/** Skip cities more than ~80° from the view centre: they are on the far side of the planet. */
const FAR_SIDE = (80 * Math.PI) / 180;

type Props = {
  map: MapLibreMap;
  groups: ReadonlyMap<string, CityGroup>;
  selectedId: string | null;
  onPress: (locationId: string) => void;
};

export function CityPins({ map, groups, selectedId, onPress }: Props) {
  const [visible, setVisible] = useState<string[]>([]);

  const recompute = useEffectEvent(() => {
    if (!map.getSource(SRC.cities)) return;
    const { clientWidth: w, clientHeight: h } = map.getContainer();
    const center = map.getCenter();
    const globe = map.getZoom() < 6;
    const seen = new Set<string>();
    const candidates: { id: string; d: number }[] = [];
    for (const f of map.querySourceFeatures(SRC.cities)) {
      const props = f.properties as { cluster?: boolean; locationId?: string } | null;
      if (!props || props.cluster || !props.locationId || seen.has(props.locationId)) continue;
      seen.add(props.locationId);
      const g = groups.get(props.locationId);
      if (!g) continue;
      const { lng, lat } = g.location;
      if (globe && angularDistance([center.lng, center.lat], [lng, lat]) > FAR_SIDE) continue;
      const pt = map.project([lng, lat]);
      if (pt.x < -48 || pt.y < -24 || pt.x > w + 48 || pt.y > h + 96) continue;
      candidates.push({ id: props.locationId, d: Math.hypot(pt.x - w / 2, pt.y - h / 2) });
    }
    candidates.sort((a, b) => a.d - b.d);
    const next = candidates.slice(0, MAX_PINS).map((c) => c.id);
    // Keep the selected city pinned even when it would fall outside the cap.
    if (selectedId && seen.has(selectedId) && groups.has(selectedId) && !next.includes(selectedId)) {
      if (next.length >= MAX_PINS) next.pop();
      next.push(selectedId);
    }
    next.sort();
    setVisible((prev) => (prev.length === next.length && prev.every((id, i) => id === next[i]) ? prev : next));
  });

  useEffect(() => {
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let raf = 0;
    const run = () => {
      last = performance.now();
      timer = undefined;
      recompute();
    };
    const throttled = () => {
      const wait = THROTTLE_MS - (performance.now() - last);
      if (wait <= 0) run();
      else timer ??= setTimeout(run, wait);
    };
    const onSourceData = (e: { sourceId?: string; isSourceLoaded?: boolean }) => {
      if (e.sourceId === SRC.cities && e.isSourceLoaded) throttled();
    };
    map.on("move", throttled);
    map.on("moveend", run);
    map.on("sourcedata", onSourceData);
    raf = requestAnimationFrame(run);
    return () => {
      map.off("move", throttled);
      map.off("moveend", run);
      map.off("sourcedata", onSourceData);
      cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
    };
  }, [map]);

  // New data (filters) or a new selection → re-diff on the next frame.
  useEffect(() => {
    const raf = requestAnimationFrame(() => recompute());
    return () => cancelAnimationFrame(raf);
  }, [groups, selectedId]);

  return (
    <>
      {visible.map((id) => {
        const g = groups.get(id);
        return g ? <PinMarker key={id} map={map} group={g} selected={id === selectedId} onPress={onPress} /> : null;
      })}
    </>
  );
}

const PinMarker = memo(function PinMarker({
  map,
  group,
  selected,
  onPress,
}: {
  map: MapLibreMap;
  group: CityGroup;
  selected: boolean;
  onPress: (locationId: string) => void;
}) {
  const [el] = useState(() => {
    const div = document.createElement("div");
    div.className = styles.pin!;
    return div;
  });
  const marker = useRef<Marker | null>(null);
  const { lng, lat } = group.location;

  useLayoutEffect(() => {
    const m = new Marker({ element: el, anchor: "bottom", opacityWhenCovered: 0, subpixelPositioning: true }).setLngLat([lng, lat]).addTo(map);
    marker.current = m;
    return () => {
      m.remove();
      marker.current = null;
    };
  }, [map, el, lng, lat]);

  useEffect(() => {
    marker.current?.getElement().toggleAttribute("data-selected", selected);
  }, [selected]);

  return createPortal(<AvatarPin group={group} selected={selected} onPress={onPress} />, el);
});

/** Semi-opaque white bubble (no backdrop blur) with an avatar stack, head count and a tail. */
export function AvatarPin({ group, selected, onPress }: { group: CityGroup; selected: boolean; onPress: (locationId: string) => void }) {
  const count = group.people.length;
  const single = count === 1;
  const label = `${group.location.name}: ${single ? group.people[0]!.displayName : `${count} people`}`;
  return (
    <motion.button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={(e) => {
        e.stopPropagation();
        onPress(group.location.id);
      }}
      initial={{ opacity: 0, scale: 0.5, y: 6 }}
      animate={{ opacity: 1, scale: selected ? 1.12 : 1, y: 0 }}
      transition={spring.pop}
      style={{ transformOrigin: "50% 100%" }}
      className="group relative flex cursor-pointer flex-col items-center pb-0.5 outline-none select-none [-webkit-tap-highlight-color:transparent]"
    >
      <span
        className={cn(
          "relative z-[1] flex items-center rounded-full bg-surface-2 p-[3px] ring-[0.5px] ring-hairline specular elevation-e2 transition-shadow duration-200",
          "group-hover:elevation-e3 group-focus-visible:ring-2 group-focus-visible:ring-accent",
          selected && "ring-2 ring-accent",
          !single && "pr-2.5",
        )}
      >
        <span className="flex -space-x-2.5">
          {group.avatars.map((a) => (
            <Avatar key={a.id} name={a.name} src={a.url} size={single ? 34 : 28} className="ring-2 ring-surface-solid" />
          ))}
        </span>
        {!single && <span className="ml-1.5 text-footnote font-semibold text-fg tabular-nums">{count}</span>}
        {group.hasInner && <span aria-hidden className="absolute top-0 right-0 size-2.5 rounded-full bg-warm-inner ring-2 ring-surface-solid" />}
      </span>
      <span aria-hidden className="-mt-[7px] size-3 rotate-45 bg-surface-2 shadow-e1" />
    </motion.button>
  );
}
