"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Search, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Chip } from "@/components/glass/Chip";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassCard } from "@/components/glass/GlassCard";
import { GlassInput } from "@/components/glass/GlassInput";
import { CategoryIcon } from "@/components/people/CategoryIcon";
import { api } from "@/lib/api";
import type { AggregatedPerson, PeopleDecisions } from "@/lib/data/import";
import { useCategories, usePeople } from "@/lib/queries/people";
import { cn, formatDate } from "@/lib/utils";

type Row = { action: "create" | "merge" | "skip" | "undecided"; personId: string | null; name: string; city: string; categories: string[] };

export function ImportPeople({ jobId, onCommitted }: { jobId: string; onCommitted: () => void }) {
  const qc = useQueryClient();
  const { data: agg = [], isPending } = useQuery({ queryKey: ["import", "people", jobId], queryFn: () => api.get<AggregatedPerson[]>(`/api/import/${jobId}/people`) });
  const { data: cats = [] } = useCategories();
  const { data: people = [] } = usePeople();
  const [rows, setRows] = useState<Record<string, Row>>(() => {
    try { return JSON.parse(localStorage.getItem(`import-decisions-${jobId}`) ?? "{}"); } catch { return {}; }
  });
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [minMentions, setMinMentions] = useState(1);
  const [applying, setApplying] = useState<null | { committed: number; remaining: number }>(null);
  const storageKey = `import-decisions-${jobId}`;

  // Defaults (merge when a match exists, otherwise undecided) are derived, not stored, until edited.
  const defaultRow = (p: AggregatedPerson): Row => ({
    action: p.matchPersonId ? "merge" : "undecided",
    personId: p.matchPersonId,
    name: p.name,
    city: p.cities[0] ?? "",
    categories: Object.entries(p.categories).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k),
  });
  const rowFor = (p: AggregatedPerson): Row => rows[p.key] ?? defaultRow(p);
  useEffect(() => {
    if (Object.keys(rows).length) try { localStorage.setItem(storageKey, JSON.stringify(rows)); } catch {}
  }, [rows, storageKey]);

  const byKey = useMemo(() => Object.fromEntries(agg.map((p) => [p.key, p])), [agg]);
  const set = (key: string, patch: Partial<Row>) => setRows((r) => ({ ...r, [key]: { ...(r[key] ?? defaultRow(byKey[key]!)), ...patch } }));
  const visible = useMemo(() => agg.filter((p) => p.mentions >= minMentions && (!q || p.name.toLowerCase().includes(q.toLowerCase()) || p.aliases.some((a) => a.toLowerCase().includes(q.toLowerCase())))), [agg, minMentions, q]);
  const counts = useMemo(() => {
    const c = { create: 0, merge: 0, skip: 0, undecided: 0 };
    for (const p of agg) c[rowFor(p).action]++;
    return c;
  }, [agg, rows]);
  const bulk = (action: Row["action"]) => setRows((r) => { const n = { ...r }; for (const p of visible) n[p.key] = { ...(n[p.key] ?? defaultRow(p)), action }; return n; });

  const apply = async () => {
    const decisions: PeopleDecisions = {};
    for (const p of agg) {
      const r = rowFor(p);
      const key = p.key;
      if (r.action === "undecided") continue;
      decisions[key] = { action: r.action, personId: r.action === "merge" ? r.personId : null, name: r.name, city: r.city || null, categories: r.categories };
    }
    setApplying({ committed: 0, remaining: 1 });
    let total = 0;
    for (;;) {
      const res = await api.post<{ committed: number; remaining: number }>(`/api/import/${jobId}/people`, { decisions });
      total += res.committed;
      setApplying({ committed: total, remaining: res.remaining });
      if (res.committed === 0) break;
    }
    qc.invalidateQueries({ queryKey: ["import"] });
    qc.invalidateQueries({ queryKey: ["people"] });
    qc.invalidateQueries({ queryKey: ["globe"] });
    qc.invalidateQueries({ queryKey: ["graph"] });
    onCommitted();
    setTimeout(() => setApplying(null), 1500);
  };

  if (isPending) return <div className="glass h-40 animate-pulse rounded-[var(--r-lg)]" />;
  if (!agg.length) return <GlassCard className="text-center text-[14px] text-fg-2">No people waiting for a decision.</GlassCard>;

  return (
    <div className="space-y-3">
      <GlassCard className="space-y-3">
        <p className="text-[14px] text-fg-2">
          <span className="font-semibold text-fg">{agg.length} people</span> found across your notes. Decide once per person — their notes are filed automatically. Names that appear only once are often passers-by; skip freely.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="glass flex h-10 flex-1 items-center gap-2 rounded-full px-3 min-w-[200px]">
            <Search size={15} className="text-fg-3" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter names…" className="w-full bg-transparent text-[14px] outline-none" />
          </div>
          <div className="glass flex rounded-full p-0.5">
            {[1, 2, 3].map((n) => (
              <button key={n} onClick={() => setMinMentions(n)} className={cn("rounded-full px-3 py-1.5 text-[12.5px] font-medium", minMentions === n ? "bg-accent text-accent-fg" : "text-fg-3")}>{n === 1 ? "All" : `≥${n} mentions`}</button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-fg-3">{visible.length} shown:</span>
          <GlassButton size="sm" variant="soft" onClick={() => bulk("create")}><Check size={13} /> Create all shown</GlassButton>
          <GlassButton size="sm" variant="ghost" onClick={() => bulk("skip")}><X size={13} /> Skip all shown</GlassButton>
          <span className="ml-auto text-fg-3">{counts.create} create · {counts.merge} merge · {counts.skip} skip · <span className={counts.undecided ? "text-warm-dormant font-medium" : ""}>{counts.undecided} undecided</span></span>
        </div>
      </GlassCard>

      <GlassCard padded={false} className="p-1.5">
        <ul className="divide-y divide-[var(--glass-border-2)]">
          {visible.map((p) => {
            const r = rowFor(p);
            const isOpen = open === p.key;
            return (
              <li key={p.key} className={cn("px-2 py-2", r.action === "skip" && "opacity-50")}>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => setOpen(isOpen ? null : p.key)} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-fg-3 hover:bg-fg/6"><ChevronDown size={14} className={cn("transition-transform", isOpen && "rotate-180")} /></button>
                  <GlassInput value={r.name} onChange={(e) => set(p.key, { name: e.target.value })} className="h-9 w-[200px] text-[14.5px] font-semibold" />
                  <span className="rounded-full bg-fg/6 px-2 py-0.5 text-[12px] text-fg-2" title="mentions">×{p.mentions}</span>
                  {(p.roles[0] || p.companies[0]) && <span className="truncate text-[12.5px] text-fg-3 max-w-[220px]">{[p.roles[0], p.companies[0]].filter(Boolean).join(" · ")}</span>}
                  <GlassInput value={r.city} onChange={(e) => set(p.key, { city: e.target.value })} placeholder="City" className="h-9 w-[130px] text-[13px]" />
                  <div className="ml-auto flex items-center gap-1">
                    <ActionButton active={r.action === "create"} onClick={() => set(p.key, { action: "create" })} label="Create" tone="accent" />
                    {(p.matchPersonId || people.length > 0) && (
                      <select
                        value={r.action === "merge" ? r.personId ?? "" : ""}
                        onChange={(e) => e.target.value && set(p.key, { action: "merge", personId: e.target.value })}
                        className={cn("glass h-8 max-w-[170px] rounded-full px-2.5 text-[12.5px] outline-none", r.action === "merge" && "ring-1 ring-accent")}
                      >
                        <option value="">Merge into…</option>
                        {p.matchPersonId && <option value={p.matchPersonId}>{p.matchName} (suggested)</option>}
                        {people.filter((x) => x.id !== p.matchPersonId).map((x) => <option key={x.id} value={x.id}>{x.displayName}</option>)}
                      </select>
                    )}
                    <ActionButton active={r.action === "skip"} onClick={() => set(p.key, { action: "skip" })} label="Skip" tone="muted" />
                  </div>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-9">
                  {cats.map((cat) => {
                    const on = r.categories.includes(cat.slug);
                    const hint = p.categories[cat.slug];
                    return (
                      <button key={cat.id} onClick={() => set(p.key, { categories: on ? r.categories.filter((s) => s !== cat.slug) : [...r.categories, cat.slug] })} className="pressable" title={hint ? `suggested ${hint}×` : undefined}>
                        <Chip color={cat.color} active={on} size="sm"><CategoryIcon name={cat.icon} size={11} /> {cat.name}</Chip>
                      </button>
                    );
                  })}
                  {p.aliases.length > 0 && <span className="text-[11.5px] text-fg-4">aka {p.aliases.join(", ")}</span>}
                </div>
                {isOpen && (
                  <div className="mt-2 rounded-[12px] bg-fg/4 p-3 pl-4 text-[13px]">
                    {p.keyFacts.length > 0 && <ul className="mb-2 list-disc pl-4 text-fg-2">{p.keyFacts.map((f, i) => <li key={i}>{f}</li>)}</ul>}
                    <p className="text-[12px] font-medium uppercase tracking-wide text-fg-4">Appears in</p>
                    <ul className="mt-1 space-y-0.5 text-fg-2">
                      {p.items.map((it) => <li key={it.id + it.index}>{it.title || "Untitled"} <span className="text-fg-4">· {formatDate(it.date)} · {Math.round(it.confidence * 100)}%</span></li>)}
                    </ul>
                    {p.followUps > 0 && <p className="mt-2 text-accent-strong">{p.followUps} follow-up{p.followUps > 1 ? "s" : ""} will become reminders</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </GlassCard>

      <div className="sticky bottom-[calc(84px+var(--sab))] z-20 lg:bottom-6">
        <GlassCard strong className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[13.5px] text-fg-2">
            {applying ? (
              <span className="inline-flex items-center gap-2"><Users size={15} className="animate-pulse text-accent-strong" /> Filed {applying.committed} notes{applying.remaining > 0 ? `, ${applying.remaining} waiting on undecided people` : " · done"}</span>
            ) : (
              <>Ready: <span className="font-semibold text-fg">{counts.create + counts.merge}</span> people · notes with any undecided person stay in the queue</>
            )}
          </div>
          <GlassButton variant="primary" onClick={apply} disabled={!!applying || counts.create + counts.merge + counts.skip === 0}>
            <Check size={16} strokeWidth={2.5} /> Apply decisions
          </GlassButton>
        </GlassCard>
      </div>
    </div>
  );
}

function ActionButton({ active, onClick, label, tone }: { active: boolean; onClick: () => void; label: string; tone: "accent" | "muted" }) {
  return (
    <button onClick={onClick} className={cn("pressable h-8 rounded-full px-3 text-[12.5px] font-medium", active ? (tone === "accent" ? "bg-accent text-accent-fg" : "bg-fg/70 text-white dark:bg-white/70 dark:text-black") : "bg-fg/6 text-fg-2")}>{label}</button>
  );
}
