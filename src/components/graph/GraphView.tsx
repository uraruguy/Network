"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, X } from "lucide-react";
import { Avatar } from "@/components/glass/Avatar";
import { Chip } from "@/components/glass/Chip";
import { CategoryIcon } from "@/components/people/CategoryIcon";
import { CircleBadge } from "@/components/people/CirclePicker";
import { ViewSwitch } from "@/components/globe/ViewSwitch";
import { useGraph, useProfile } from "@/lib/queries/misc";
import { useCategories } from "@/lib/queries/people";
import { CIRCLES, type Circle } from "@/lib/db/schema";
import { CIRCLE_META, cn, flag } from "@/lib/utils";

const NetworkGraph = dynamic(() => import("./NetworkGraph").then((m) => m.NetworkGraph), { ssr: false });

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

export function GraphView() {
  const { data, isPending } = useGraph();
  const { data: profile } = useProfile();
  const { data: cats = [] } = useCategories();
  const [category, setCategory] = useState<string | null>(null);
  const [circle, setCircle] = useState<Circle | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const dark = useDark();
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e!.contentRect.width), h: Math.round(e!.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const filtered = useMemo(() => {
    if (!data) return { nodes: [], links: [] };
    const keep = new Set(data.nodes.filter((n) => (!category || n.categoryIds.includes(category)) && (!circle || n.circle === circle)).map((n) => n.id));
    return {
      nodes: data.nodes.filter((n) => keep.has(n.id)),
      links: data.links.filter((l) => (l.source === "me" || keep.has(l.source)) && keep.has(l.target)),
    };
  }, [data, category, circle]);

  const sel = filtered.nodes.find((n) => n.id === selected) ?? null;
  const selLinks = sel ? filtered.links.filter((l) => l.source === sel.id || l.target === sel.id) : [];
  const nameOf = (id: string) => (id === "me" ? "You" : filtered.nodes.find((n) => n.id === id)?.name ?? "?");
  const introducedCount = filtered.links.filter((l) => l.kind === "introduced").length;

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <div ref={box} className="absolute inset-0">
        {size.w > 0 && !isPending && (
          <NetworkGraph nodes={filtered.nodes} links={filtered.links} meName={profile?.displayName ?? "You"} selectedId={selected} onSelect={setSelected} dark={dark} width={size.w} height={size.h} />
        )}
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-4 pt-[calc(12px+var(--sat))] lg:p-8">
        <div className="flex items-start justify-between gap-3">
          <div className="pointer-events-auto glass specular rounded-[22px] px-4 py-2.5">
            <h1 className="text-[22px] font-bold tracking-tight leading-none">Graph</h1>
            <p className="mt-1 text-[12.5px] text-fg-2">
              {filtered.nodes.length} people · {introducedCount} {introducedCount === 1 ? "introduction" : "introductions"}
            </p>
          </div>
          <ViewSwitch />
        </div>
        <div className="pointer-events-auto no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
          {cats.map((c) => (
            <button key={c.id} className="pressable shrink-0" onClick={() => setCategory(category === c.id ? null : c.id)}>
              <Chip color={c.color} active={category === c.id} className="glass"><CategoryIcon name={c.icon} size={13} /> {c.name}</Chip>
            </button>
          ))}
          <span className="mx-0.5 w-px shrink-0 bg-fg/10" />
          {CIRCLES.map((c) => (
            <button key={c} className="pressable shrink-0" onClick={() => setCircle(circle === c ? null : c)}>
              <Chip active={circle === c} className="glass"><span className="h-2 w-2 rounded-full" style={{ background: CIRCLE_META[c].color }} /> {CIRCLE_META[c].short}</Chip>
            </button>
          ))}
        </div>
      </div>

      {!isPending && (data?.nodes.length ?? 0) === 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[calc(100px+var(--sab))] z-10 flex justify-center px-6 lg:bottom-10">
          <div className="pointer-events-auto glass specular max-w-sm rounded-[var(--r-lg)] px-5 py-4 text-center">
            <p className="text-[15px] font-semibold">Your map of introductions</p>
            <p className="mt-1 text-[13.5px] text-fg-2">Set “Introduced by” on people and the web of who-knows-who draws itself.</p>
          </div>
        </div>
      )}

      <AnimatePresence>
        {sel && (
          <motion.aside key={sel.id} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={{ type: "spring", stiffness: 420, damping: 36 }}
            className="absolute inset-x-3 bottom-[calc(84px+var(--sab))] z-20 max-h-[46dvh] lg:inset-x-auto lg:right-8 lg:top-28 lg:bottom-10 lg:w-[360px] lg:max-h-none">
            <div className="glass-strong specular flex max-h-full flex-col overflow-hidden rounded-[var(--r-xl)]">
              <div className="flex items-start gap-3 px-5 pt-4 pb-3">
                <Avatar name={sel.name} src={sel.avatarUrl} size={44} />
                <div className="min-w-0 flex-1">
                  <Link href={`/people/${sel.id}`} className="flex items-center gap-1 text-[18px] font-bold tracking-tight leading-tight hover:underline">
                    <span className="truncate">{sel.name}</span> <ChevronRight size={16} className="shrink-0 text-fg-4" />
                  </Link>
                  <p className="text-[13px] text-fg-2">{sel.location ? `${flag(sel.countryCode)} ${sel.location} · ` : ""}{sel.notes} {sel.notes === 1 ? "note" : "notes"}</p>
                  <div className="mt-1.5"><CircleBadge circle={sel.circle} /></div>
                </div>
                <button onClick={() => setSelected(null)} aria-label="Close" className="pressable grid h-8 w-8 shrink-0 place-items-center rounded-full bg-fg/6 text-fg-2"><X size={15} /></button>
              </div>
              <ul className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 text-[14px]">
                {selLinks.map((l, i) => {
                  const other = l.source === sel.id ? l.target : l.source;
                  const label = l.kind === "introduced" ? (l.source === sel.id ? `Introduced me to ${nameOf(other)}` : `Introduced by ${nameOf(other)}`) : l.kind === "mention" ? `Mentioned together with ${nameOf(other)} (${l.weight})` : "Met directly";
                  return (
                    <li key={i} className={cn("flex items-center gap-2 py-1", l.kind === "met" && "text-fg-3")}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", l.kind === "introduced" ? "bg-accent" : l.kind === "mention" ? "bg-warm-inner" : "bg-fg-4")} />
                      {other !== "me" && other !== sel.id ? <button className="text-left hover:underline" onClick={() => setSelected(other)}>{label}</button> : label}
                    </li>
                  );
                })}
              </ul>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
