"use client";
import Link from "next/link";
import { ArrowLeft, Check, ChevronDown, RefreshCw, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassCard } from "@/components/glass/GlassCard";
import { api } from "@/lib/api";
import type { StoredExtraction } from "@/lib/data/import";
import { useImportJob, useItemAction, type ImportItemRow } from "@/lib/queries/import";
import { cn, formatDate } from "@/lib/utils";
import { ImportItemCard } from "./ImportItemCard";
import { ImportPeople } from "./ImportPeople";

type Phase = "idle" | "classifying" | "extracting" | "done";

export function ImportJob({ jobId }: { jobId: string }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const running = phase === "classifying" || phase === "extracting";
  const { data: job, refetch } = useImportJob(jobId, running ? 2500 : false);
  const act = useItemAction(jobId);
  const [tab, setTab] = useState<"people" | "review" | "committed" | "skipped" | "failed">("people");
  const [bulkBusy, setBulkBusy] = useState(false);
  const started = useRef(false);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const it of job?.items ?? []) c[it.status] = (c[it.status] ?? 0) + 1;
    return c;
  }, [job]);

  // Drive the AI passes from the client: small server calls, resumable, visible progress.
  useEffect(() => {
    if (!job || started.current) return;
    if (!(counts.pending || counts.classified)) return;
    started.current = true;
    let cancelled = false;
    (async () => {
      try {
        setPhase("classifying");
        // eslint-disable-next-line no-constant-condition
        while (!cancelled) {
          const r = await api.post<{ processed: number; remaining: number }>(`/api/import/${jobId}/classify`, {});
          if (r.processed === 0 || r.remaining === 0) break;
        }
        setPhase("extracting");
        while (!cancelled) {
          const r = await api.post<{ processed: number; remaining: number }>(`/api/import/${jobId}/extract`, {});
          if (r.processed === 0 || r.remaining === 0) break;
        }
      } finally {
        if (!cancelled) {
          setPhase("done");
          refetch();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [job, counts.pending, counts.classified, jobId, refetch]);

  if (!job) return <div className="glass h-40 animate-pulse rounded-[var(--r-lg)]" />;

  const total = job.items.length;
  const doneAi = total - (counts.pending ?? 0) - (counts.classified ?? 0);
  const lists: Record<Exclude<typeof tab, "people">, ImportItemRow[]> = {
    review: job.items.filter((i) => i.status === "extracted"),
    committed: job.items.filter((i) => i.status === "committed"),
    skipped: job.items.filter((i) => i.status === "skipped"),
    failed: job.items.filter((i) => i.status === "failed"),
  };
  const highConf = lists.review.filter((i) => {
    const ex = i.candidates as StoredExtraction | null;
    return ex?.candidates.length && ex.candidates.every((c) => c.confidence >= 0.85);
  }).length;

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <Link href="/import" className="pressable inline-flex h-9 items-center gap-1 rounded-full pr-3 pl-1.5 text-[15px] font-medium text-accent-strong hover:bg-accent-soft"><ArrowLeft size={18} /> Import</Link>
        <span className="text-[13px] text-fg-3">{formatDate(job.createdAt)}</span>
      </div>
      <h1 className="text-[26px] font-bold tracking-tight">{job.label}</h1>
      <p className="mt-1 text-[14px] text-fg-2">{total} notes · {counts.committed ?? 0} imported · {counts.skipped ?? 0} not about people</p>

      {(running || (counts.pending ?? 0) + (counts.classified ?? 0) > 0) && (
        <GlassCard className="mt-4">
          <div className="flex items-center gap-3">
            <Sparkles className={cn("shrink-0 text-accent-strong", running && "animate-pulse")} size={18} />
            <div className="min-w-0 flex-1">
              <p className="text-[14.5px] font-medium">{phase === "classifying" ? "Reading your notes…" : phase === "extracting" ? "Extracting people…" : "Ready to process"}</p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-fg/8">
                <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${total ? (doneAi / total) * 100 : 0}%` }} />
              </div>
              <p className="mt-1 text-[12px] text-fg-3">{doneAi}/{total} · {counts.classified ?? 0} waiting for extraction</p>
            </div>
          </div>
        </GlassCard>
      )}

      <div className="no-scrollbar mt-5 flex gap-2 overflow-x-auto">
        {([["people", "People"], ["review", `Notes · ${lists.review.length}`], ["committed", `Imported · ${lists.committed.length}`], ["skipped", `Skipped · ${lists.skipped.length}`], ["failed", `Failed · ${lists.failed.length}`]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("pressable shrink-0 rounded-full px-3.5 py-1.5 text-[13.5px] font-medium", tab === k ? "bg-accent text-accent-fg" : "glass text-fg-2")}>{label}</button>
        ))}
        {tab === "review" && highConf > 0 && (
          <button
            disabled={bulkBusy}
            onClick={async () => { setBulkBusy(true); try { await api.post(`/api/import/${jobId}/bulk`, {}); refetch(); } finally { setBulkBusy(false); } }}
            className="pressable ml-auto shrink-0 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3.5 py-1.5 text-[13.5px] font-medium text-accent-strong"
          >
            <Check size={14} /> Approve {highConf} confident
          </button>
        )}
        {tab === "failed" && lists.failed.length > 0 && (
          <button onClick={async () => { started.current = false; await api.post(`/api/import/${jobId}/classify?retry=1`, {}); refetch(); }} className="pressable ml-auto inline-flex items-center gap-1.5 rounded-full bg-fg/6 px-3.5 py-1.5 text-[13.5px] font-medium"><RefreshCw size={14} /> Retry</button>
        )}
      </div>

      {tab === "people" && <div className="mt-4"><ImportPeople jobId={jobId} onCommitted={() => refetch()} /></div>}

      <div className={cn("mt-4 space-y-3", tab === "people" && "hidden")}>
        {tab !== "people" && lists[tab].length === 0 && (
          <GlassCard className="text-center text-[14px] text-fg-2">
            {tab === "review" ? (running ? "Items appear here as they are extracted." : "Nothing left to review 🎉") : "Nothing here."}
          </GlassCard>
        )}
        {tab !== "people" && lists[tab].map((it) => (
          <ImportItemCard key={it.id} item={it} mode={tab} onCommit={(decision) => act.mutate({ itemId: it.id, action: "commit", decision })} onSkip={() => act.mutate({ itemId: it.id, action: "skip" })} onReopen={() => { started.current = false; act.mutate({ itemId: it.id, action: "reopen" }); }} busy={act.isPending} />
        ))}
      </div>
    </>
  );
}

export function Collapsible({ title, children, defaultOpen = false }: { title: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-1.5 text-left text-[13px] font-medium text-fg-2">
        <ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} /> {title}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

export function Dismiss({ onClick }: { onClick: () => void }) {
  return <GlassButton size="iconSm" variant="ghost" onClick={onClick} aria-label="Skip"><X size={15} /></GlassButton>;
}
