"use client";
import Globe, { type GlobeMethods } from "react-globe.gl";
import * as THREE from "three";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GlobeEntry } from "@/lib/queries/types";
import { WARMTH_META } from "@/lib/utils";

export type GlobePoint = {
  id: string;
  lat: number;
  lng: number;
  name: string;
  country: string;
  count: number;
  entry: GlobeEntry;
};

type Props = {
  entries: GlobeEntry[];
  home: { lat: number; lng: number } | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  showArcs: boolean;
  dark: boolean;
  width: number;
  height: number;
};

const ACCENT = "#0fb5ba";

/** Camera altitude (in globe radii) that fits the whole globe with a margin, for any aspect ratio. */
function fitAltitude(width: number, height: number) {
  const aspect = Math.max(0.3, width / Math.max(1, height));
  const fovHalf = (50 / 2) * (Math.PI / 180); // react-globe.gl camera vertical FOV
  const need = 1.18 / Math.tan(fovHalf); // distance/R to fit the sphere vertically with margin
  const dist = aspect >= 1 ? need : need / aspect;
  return Math.max(1.9, dist - 1);
}
const ACCENT_LIGHT = "#2ad4dd";

export function NetworkGlobe({ entries, home, selectedId, onSelect, showArcs, dark, width, height }: Props) {
  const ref = useRef<GlobeMethods | undefined>(undefined);
  const [land, setLand] = useState<object[]>([]);
  const [hover, setHover] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const interacted = useRef(false);

  useEffect(() => {
    let alive = true;
    fetch("/data/countries-110m.json")
      .then((r) => r.json())
      .then((topo: Topology) => {
        if (!alive) return;
        const fc = feature(topo, topo.objects.countries as never) as unknown as {
          features: Array<{ id?: string; properties: { name?: string }; geometry: { type: string; coordinates: unknown[] } }>;
        };
        // H3 (hex tiling) throws on polar polygons and on rings that jump across the antimeridian
        // (Chukotka, Fiji…), and one throw aborts the whole layer — so drop Antarctica, split
        // MultiPolygons into Polygons and skip any ring with a >180° longitude jump.
        const crossesAntimeridian = (ring: number[][]) => ring.some((pt, i) => i > 0 && Math.abs(pt[0]! - ring[i - 1]![0]!) > 180);
        // H3 also rejects rings with consecutive duplicate vertices (e.g. North Korea in NE 110m).
        const dedupe = (ring: number[][]) => ring.filter((pt, i) => i === 0 || pt[0] !== ring[i - 1]![0] || pt[1] !== ring[i - 1]![1]);
        const polys: object[] = [];
        for (const f of fc.features) {
          if (f.id === "010" || f.properties?.name === "Antarctica") continue;
          const parts = f.geometry.type === "MultiPolygon" ? (f.geometry.coordinates as number[][][][]) : [f.geometry.coordinates as number[][][]];
          for (const raw of parts) {
            if (raw.some(crossesAntimeridian)) continue;
            const coords = raw.map(dedupe).filter((ring) => ring.length >= 4);
            if (!coords.length) continue;
            polys.push({ type: "Feature", properties: f.properties, geometry: { type: "Polygon", coordinates: coords } });
          }
        }
        setLand(polys);
      });
    return () => {
      alive = false;
    };
  }, []);

  const points: GlobePoint[] = useMemo(
    () =>
      entries.map((e) => ({
        id: e.location.id,
        lat: e.location.lat,
        lng: e.location.lng,
        name: e.location.name,
        country: e.location.country,
        count: e.people.length,
        entry: e,
      })),
    [entries],
  );

  const maxCount = Math.max(1, ...points.map((p) => p.count));

  const arcs = useMemo(() => {
    if (!showArcs || !home) return [];
    return points.map((p) => ({ startLat: home.lat, startLng: home.lng, endLat: p.lat, endLng: p.lng, id: p.id }));
  }, [points, home, showArcs]);

  const rings = useMemo(() => {
    const sel = points.find((p) => p.id === selectedId);
    return sel ? [{ lat: sel.lat, lng: sel.lng }] : [];
  }, [points, selectedId]);

  const globeMaterial = useMemo(() => {
    const m = new THREE.MeshPhongMaterial();
    m.color = new THREE.Color(dark ? "#0b2a2d" : "#dff6f7");
    m.emissive = new THREE.Color(dark ? "#062022" : "#c8eef0");
    m.emissiveIntensity = 0.35;
    m.shininess = 30;
    m.specular = new THREE.Color(dark ? "#1c6a70" : "#ffffff");
    m.transparent = true;
    m.opacity = dark ? 0.92 : 0.96;
    return m;
  }, [dark]);

  // Initial camera + gentle auto-rotate until the user touches the globe.
  useEffect(() => {
    const g = ref.current;
    if (!g || !ready) return;
    const controls = g.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 130;
    controls.maxDistance = 800;
    controls.zoomSpeed = 0.6;
    g.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const stop = () => {
      interacted.current = true;
      controls.autoRotate = false;
    };
    controls.addEventListener("start", stop);
    const sel = selectedId ? points.find((p) => p.id === selectedId) : null;
    const start = sel ?? home ?? { lat: 30, lng: 10 };
    g.pointOfView({ lat: start.lat, lng: start.lng, altitude: sel ? 1.6 : fitAltitude(width, height) }, 0);
    if (sel) controls.autoRotate = false;
    return () => controls.removeEventListener("start", stop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Fly to the selected city.
  useEffect(() => {
    const g = ref.current;
    if (!g || !ready || !selectedId) return;
    const p = points.find((x) => x.id === selectedId);
    if (!p) return;
    g.controls().autoRotate = false;
    const cur = g.pointOfView();
    g.pointOfView({ lat: p.lat, lng: p.lng, altitude: Math.min(cur.altitude ?? 2, 1.6) }, 900);
  }, [selectedId, points, ready]);

  const dominantColor = (p: GlobePoint) => {
    if (p.id === selectedId) return "#ff6b6b";
    if (p.id === hover) return ACCENT_LIGHT;
    const inner = p.entry.people.some((x) => x.warmth === "inner");
    return inner ? WARMTH_META.inner.color : ACCENT;
  };

  return (
    <Globe
      ref={ref}
      width={width}
      height={height}
      backgroundColor="rgba(0,0,0,0)"
      rendererConfig={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      animateIn
      onGlobeReady={() => requestAnimationFrame(() => setReady(true))}
      globeMaterial={globeMaterial}
      showAtmosphere
      atmosphereColor={dark ? "#2ad4dd" : "#7fe3e8"}
      atmosphereAltitude={0.18}
      hexPolygonsData={land}
      hexPolygonResolution={3}
      hexPolygonMargin={0.42}
      hexPolygonAltitude={0.004}
      hexPolygonUseDots
      hexPolygonColor={() => (dark ? "rgba(42,212,221,0.55)" : "rgba(10,148,154,0.62)")}
      pointsData={points}
      pointLat="lat"
      pointLng="lng"
      pointColor={(d) => dominantColor(d as GlobePoint)}
      pointAltitude={(d) => 0.02 + ((d as GlobePoint).count / maxCount) * 0.12}
      pointRadius={(d) => 0.35 + Math.sqrt((d as GlobePoint).count) * 0.22}
      pointResolution={16}
      pointLabel={(d) => {
        const p = d as GlobePoint;
        return `<div style="font:500 13px -apple-system,system-ui;padding:6px 10px;border-radius:12px;background:rgba(255,255,255,.85);color:#0b2426;backdrop-filter:blur(12px);box-shadow:0 8px 24px -8px rgba(0,0,0,.3)">${p.name} · ${p.count} ${p.count === 1 ? "person" : "people"}</div>`;
      }}
      onPointClick={(d) => onSelect((d as GlobePoint).id)}
      onPointHover={(d) => setHover(d ? (d as GlobePoint).id : null)}
      onGlobeClick={() => onSelect(null)}
      ringsData={rings}
      ringColor={() => (t: number) => `rgba(255,107,107,${1 - t})`}
      ringMaxRadius={4}
      ringPropagationSpeed={2}
      ringRepeatPeriod={900}
      arcsData={arcs}
      arcColor={() => [dark ? "rgba(42,212,221,0.9)" : "rgba(10,148,154,0.85)", "rgba(255,107,107,0.35)"]}
      arcAltitudeAutoScale={0.35}
      arcStroke={0.35}
      arcDashLength={0.5}
      arcDashGap={0.25}
      arcDashAnimateTime={2600}
      labelsData={points.filter((p) => p.count >= 2 || p.id === selectedId || p.id === hover)}
      labelLat="lat"
      labelLng="lng"
      labelText="name"
      labelSize={1.1}
      labelDotRadius={0}
      labelAltitude={0.03}
      labelColor={() => (dark ? "rgba(232,246,246,0.9)" : "rgba(11,36,38,0.85)")}
      labelResolution={2}
    />
  );
}
