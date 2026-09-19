"use client";
import { Check, ChevronDown, Undo2, UserPlus, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Chip } from "@/components/glass/Chip";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassCard } from "@/components/glass/GlassCard";
import { GlassInput } from "@/components/glass/GlassInput";
import { CategoryIcon } from "@/components/people/CategoryIcon";
import type { Decision, StoredExtraction } from "@/lib/data/import";
import type { ImportItemRow } from "@/lib/queries/import";
import { useCategories, usePeople } from "@/lib/queries/people";
import { cn, formatDate } from "@/lib/utils";

type Row = { action: "create" | "merge" | "skip"; personId: string | null; name: string; city: string; categories: string[] };

const KIND_LABEL: Record<string, string> = { person: "About a person", meeting: "Meeting", list: "List of people", not_people: "Not about people" };

export function ImportItemCard({ item, mode, onCommit, onSkip, onReopen, busy }: { item: ImportItemRow; mode: "review" | "committed" | "skipped" | "failed"; onCommit: (d: Decision) => void; onSkip: () => void; onReopen: () => void; busy: boolean }) {
  const ex = item.candidates as StoredExtraction | null;
  const { data: cats = [] } = useCategories();
  const { data: people = [] } = usePeople();
  const [showNote, setShowNote] = useState(false);
  const [primary, setPrimary] = useState(0);
  const [rows, setRows] = useState<Row[]>(() =>
    (ex?.candidates ?? []).map((c) => ({ action: c.matchPersonId ? "merge" : "create", personId: c.matchPersonId, name: c.name, city: c.city ?? "", categories: c.categories })),
  );
  const [reminders, setReminders] = useState(true);
  const slugToId = useMemo(() => Object.fromEntries(cats.map((c) => [c.slug, c])), [cats]);

  const set = (i: number, patch: Partial<Row>) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const anyActive = rows.some((r) => r.action !== "skip");

  const commit = () =>
    onCommit({
      candidates: rows.map((r, i) => ({ index: i, action: r.action, personId: r.action === "merge" ? r.personId : null, name: r.name, city: r.city || null, categories: r.categories })),
      primaryIndex: rows[primary]?.action === "skip" ? (rows.findIndex((r) => r.action !== "skip") >= 0 ? rows.findIndex((r) => r.action !== "skip") : null) : primary,
      createReminders: reminders,
      noteKind: item.classification === "meeting" ? "meeting" : "note",
    });

  return (
    <GlassCard className={cn(mode !== "review" && "opacity-90")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[16px] font-semibold tracking-tight">{item.title || ex?.suggestedTitle || "Untitled"}</p>
          <p className="mt-0.5 text-[12.5px] text-fg-3">
            {item.folder} · {formatDate(item.externalCreatedAt)} · {KIND_LABEL[item.classification ?? ""] ?? item.classification}
            {item.classificationConfidence != null && ` · ${Math.round(item.classificationConfidence * 100)}%`}
          </p>
        </div>
        {mode === "review" && (
          <div className="flex shrink-0 gap-1.5">
            <GlassButton size="iconSm" variant="ghost" onClick={onSkip} aria-label="Skip" title="Skip this note"><X size={15} /></GlassButton>
          </div>
        )}
        {mode !== "review" && (
          <GlassButton size="sm" variant="ghost" onClick={onReopen} disabled={busy}><Undo2 size={14} /> Redo</GlassButton>
        )}
      </div>

      {ex?.noteSummary && <p className="mt-2 text-[14px] text-fg-2">{ex.noteSummary}</p>}
      {item.error && <p className="mt-2 text-[13px] text-danger">{item.error}</p>}

      <button onClick={() => setShowNote((s) => !s)} className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-accent-strong">
        <ChevronDown size={14} className={cn("transition-transform", showNote && "rotate-180")} /> {showNote ? "Hide" : "Show"} original note
      </button>
      {showNote && (
        <div className="mt-2 max-h-72 overflow-y-auto rounded-[12px] bg-fg/4 p-3 text-[13.5px] leading-relaxed [&_h1]:text-[16px] [&_h1]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_a]:text-accent-strong">
          {item.html ? <div dangerouslySetInnerHTML={{ __html: item.html }} /> : <pre className="whitespace-pre-wrap font-sans">{item.text}</pre>}
        </div>
      )}

      {mode === "review" && ex && (
        <div className="mt-3 space-y-3">
          {ex.candidates.length === 0 && <p className="text-[14px] text-fg-2">No people found worth adding. Skip, or redo.</p>}
          {ex.candidates.map((c, i) => {
            const r = rows[i]!;
            const skipped = r.action === "skip";
            return (
              <div key={i} className={cn("rounded-[var(--r-md)] border border-[var(--glass-border-2)] bg-white/40 p-3 dark:bg-white/5", skipped && "opacity-50")}>
                <div className="flex flex-wrap items-center gap-2">
                  <GlassInput value={r.name} onChange={(e) => set(i, { name: e.target.value })} className="h-10 flex-1 min-w-[160px] text-[15px] font-semibold" />
                  <span className="text-[12px] text-fg-3">{Math.round(c.confidence * 100)}%</span>
                  <button onClick={() => set(i, { action: skipped ? (r.personId ? "merge" : "create") : "skip" })} className="pressable grid h-8 w-8 place-items-center rounded-full bg-fg/6 text-fg-2" aria-label={skipped ? "Include" : "Exclude"}>
                    {skipped ? <Check size={14} /> : <X size={14} />}
                  </button>
                </div>
                {(c.role || c.company) && <p className="mt-1 text-[13.5px] text-fg-2">{[c.role, c.company].filter(Boolean).join(" · ")}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select
                    value={r.action === "merge" ? r.personId ?? "" : "__new"}
                    onChange={(e) => (e.target.value === "__new" ? set(i, { action: "create", personId: null }) : set(i, { action: "merge", personId: e.target.value }))}
                    className="glass h-9 max-w-[260px] rounded-full px-3 text-[13.5px] outline-none"
                  >
                    <option value="__new">＋ Create new person</option>
                    {c.matchName && c.matchPersonId && <option value={c.matchPersonId}>Merge into {c.matchName} (suggested)</option>}
                    {people.filter((p) => p.id !== c.matchPersonId).map((p) => <option key={p.id} value={p.id}>Merge into {p.displayName}</option>)}
                  </select>
                  <GlassInput value={r.city} onChange={(e) => set(i, { city: e.target.value })} placeholder="City" className="h-9 w-40 text-[13.5px]" />
                  <label className={cn("inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium", primary === i ? "bg-accent text-accent-fg" : "bg-fg/6 text-fg-2")}>
                    <input type="radio" name={`primary-${item.id}`} className="hidden" checked={primary === i} onChange={() => setPrimary(i)} />
                    {primary === i ? <Users size={12} /> : <UserPlus size={12} />} {primary === i ? "Note filed here" : "File note here"}
                  </label>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {cats.map((cat) => {
                    const on = r.categories.includes(cat.slug);
                    return (
                      <button key={cat.id} onClick={() => set(i, { categories: on ? r.categories.filter((s) => s !== cat.slug) : [...r.categories, cat.slug] })} className="pressable">
                        <Chip color={cat.color} active={on} size="sm"><CategoryIcon name={cat.icon} size={11} /> {cat.name}</Chip>
                      </button>
                    );
                  })}
                </div>
                {c.metContext && <p className="mt-2 text-[13px] text-fg-2"><span className="font-medium text-fg-3">Met: </span>{c.metContext}</p>}
                {c.keyFacts.length > 0 && (
                  <ul className="mt-1.5 list-disc pl-5 text-[13px] text-fg-2">{c.keyFacts.slice(0, 5).map((f, k) => <li key={k}>{f}</li>)}</ul>
                )}
                {c.followUps.length > 0 && (
                  <p className="mt-1.5 text-[13px] text-accent-strong">{c.followUps.map((f) => `↻ ${f.what}${f.when ? ` (${f.when})` : ""}`).join(" · ")}</p>
                )}
                {c.introducedBy && <p className="mt-1 text-[12.5px] text-fg-3">Introduced by {c.introducedBy}</p>}
                {Object.keys(slugToId).length === 0 && null}
              </div>
            );
          })}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <label className="inline-flex items-center gap-2 text-[13px] text-fg-2">
              <input type="checkbox" checked={reminders} onChange={(e) => setReminders(e.target.checked)} className="accent-[var(--accent)]" /> Create reminders from follow-ups
            </label>
            <div className="flex gap-2">
              <GlassButton variant="ghost" onClick={onSkip} disabled={busy}>Skip</GlassButton>
              <GlassButton variant="primary" onClick={commit} disabled={busy || !anyActive}><Check size={16} strokeWidth={2.5} /> Approve</GlassButton>
            </div>
          </div>
        </div>
      )}
    </GlassCard>
  );
}
