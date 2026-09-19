"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, Route, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/glass/Avatar";
import { Chip } from "@/components/glass/Chip";
import { CategoryIcon } from "@/components/people/CategoryIcon";
import { WarmthDot } from "@/components/people/WarmthPicker";
import { WARMTH, type Warmth } from "@/lib/db/schema";
import { ViewSwitch } from "./ViewSwitch";
import { useGlobe, useProfile } from "@/lib/queries/misc";
import { useCategories } from "@/lib/queries/people";
import { cn, flag, WARMTH_META } from "@/lib/utils";

const NetworkGlobe = dynamic(() => import("./NetworkGlobe").then((m) => m.NetworkGlobe), {
  ssr: false,
  loading: () => <GlobeSkeleton />,
});

function GlobeSkeleton() {
  return (
    <div className="grid h-full w-full place-items-center">
      <div className="h-[56vmin] w-[56vmin] animate-pulse rounded-full bg-accent/15 blur-sm" />
    </div>
  );
}

function useDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const update = () => setDark(el.classList.contains("dark"));
    update();
    const mo = new MutationObserver(update);
    mo.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return dark;
}

export function GlobeView() {
  const params = useSearchParams();
  const router = useRouter();
  const { data: entries = [], isPending } = useGlobe();
  const { data: profile } = useProfile();
  const { data: cats = [] } = useCategories();
  const [category, setCategory] = useState<string | null>(null);
  const [warmth, setWarmth] = useState<Warmth | null>(null);
  const [arcs, setArcs] = useState(false);
  const [selected, setSelected] = useState<string | null>(params.get("city"));
  const dark = useDark();
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e!.contentRect;
      setSize({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const url = selected ? `/globe?city=${selected}` : "/globe";
    router.replace(url, { scroll: false });
  }, [selected, router]);

  const filtered = useMemo(
    () =>
      entries
        .map((e) => ({
          ...e,
          people: e.people.filter((p) => (!category || p.categoryIds.includes(category)) && (!warmth || p.warmth === warmth)),
        }))
        .filter((e) => e.people.length > 0),
    [entries, category, warmth],
  );

  const sel = filtered.find((e) => e.location.id === selected) ?? null;
  const totalPeople = filtered.reduce((n, e) => n + e.people.length, 0);
  const countries = new Set(filtered.map((e) => e.location.countryCode ?? e.location.country)).size;
  const home = profile?.homeLocation ? { lat: profile.homeLocation.lat, lng: profile.homeLocation.lng } : null;

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <div ref={box} className="absolute inset-0 touch-none">
        {size.w > 0 && !isPending && (
          <NetworkGlobe entries={filtered} home={home} selectedId={selected} onSelect={setSelected} showArcs={arcs} dark={dark} width={size.w} height={size.h} />
        )}
      </div>

      {/* Top overlay */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-4 pt-[calc(12px+var(--sat))] lg:p-8">
        <div className="flex items-start justify-between gap-3">
          <div className="pointer-events-auto glass specular rounded-[22px] px-4 py-2.5">
            <h1 className="text-[22px] font-bold tracking-tight leading-none">Globe</h1>
            <p className="mt-1 text-[12.5px] text-fg-2">
              {totalPeople} {totalPeople === 1 ? "person" : "people"} · {filtered.length} {filtered.length === 1 ? "city" : "cities"} · {countries} {countries === 1 ? "country" : "countries"}
            </p>
          </div>
          <ViewSwitch
            trailing={
              <button
                onClick={() => setArcs((a) => !a)}
                className={cn("pressable glass specular grid h-11 w-11 place-items-center rounded-full", arcs ? "text-accent-strong" : "text-fg-3")}
                aria-label="Toggle arcs from home"
                title="Arcs from home base"
              >
                <Route size={18} />
              </button>
            }
          />
        </div>
        <div className="pointer-events-auto no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
          {cats.map((c) => (
            <button key={c.id} className="pressable shrink-0" onClick={() => setCategory(category === c.id ? null : c.id)}>
              <Chip color={c.color} active={category === c.id} className="glass">
                <CategoryIcon name={c.icon} size={13} /> {c.name}
              </Chip>
            </button>
          ))}
          <span className="mx-0.5 w-px shrink-0 bg-fg/10" />
          {WARMTH.map((w) => (
            <button key={w} className="pressable shrink-0" onClick={() => setWarmth(warmth === w ? null : w)}>
              <Chip active={warmth === w} className="glass">
                <span className="h-2 w-2 rounded-full" style={{ background: WARMTH_META[w].color }} /> {WARMTH_META[w].label}
              </Chip>
            </button>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {!isPending && entries.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[calc(100px+var(--sab))] z-10 flex justify-center px-6 lg:bottom-10">
          <div className="pointer-events-auto glass specular max-w-sm rounded-[var(--r-lg)] px-5 py-4 text-center">
            <p className="text-[15px] font-semibold">No cities yet</p>
            <p className="mt-1 text-[13.5px] text-fg-2">Give people a “Lives in” city and they’ll light up here.</p>
            <Link href="/people?new=1" className="mt-3 inline-flex h-9 items-center rounded-full bg-accent px-4 text-[14px] font-medium text-accent-fg">Add a person</Link>
          </div>
        </div>
      )}

      {/* Selected city panel */}
      <AnimatePresence>
        {sel && (
          <motion.aside
            key={sel.location.id}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
            className="absolute inset-x-3 bottom-[calc(84px+var(--sab))] z-20 max-h-[46dvh] lg:inset-x-auto lg:right-8 lg:top-28 lg:bottom-10 lg:w-[360px] lg:max-h-none"
          >
            <div className="glass-strong specular flex max-h-full flex-col overflow-hidden rounded-[var(--r-xl)]">
              <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
                <div>
                  <h2 className="text-[20px] font-bold tracking-tight leading-tight">
                    {flag(sel.location.countryCode)} {sel.location.name}
                  </h2>
                  <p className="text-[13px] text-fg-2">{sel.location.country} · {sel.people.length} {sel.people.length === 1 ? "person" : "people"}</p>
                </div>
                <button onClick={() => setSelected(null)} aria-label="Close" className="pressable grid h-8 w-8 shrink-0 place-items-center rounded-full bg-fg/6 text-fg-2">
                  <X size={15} />
                </button>
              </div>
              <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                {sel.people.map((p) => (
                  <li key={p.id}>
                    <Link href={`/people/${p.id}`} className="pressable flex items-center gap-3 rounded-[16px] px-3 py-2 hover:bg-white/50 dark:hover:bg-white/5">
                      <Avatar name={p.displayName} src={p.avatarUrl} size={38} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 truncate text-[15px] font-semibold">
                          {p.displayName} <WarmthDot warmth={p.warmth} />
                        </div>
                        <p className="truncate text-[13px] text-fg-2">{[p.headline, p.company].filter(Boolean).join(" · ") || "—"}</p>
                      </div>
                      <ChevronRight size={16} className="text-fg-4" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
