"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, FileJson, Terminal, Upload } from "lucide-react";
import { useCallback, useState } from "react";
import { GlassCard } from "@/components/glass/GlassCard";
import { PageHeader } from "@/components/shell/PageHeader";
import { useCreateImportJob, useImportJobs } from "@/lib/queries/import";
import { cn, formatDate } from "@/lib/utils";

export function ImportHome() {
  const router = useRouter();
  const { data } = useImportJobs();
  const create = useCreateImportJob();
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      try {
        const rows = JSON.parse(await file.text());
        if (!Array.isArray(rows)) throw new Error("Expected a JSON array");
        const job = await create.mutateAsync(rows);
        router.push(`/import/${job.id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not read that file");
      }
    },
    [create, router],
  );

  return (
    <>
      <PageHeader title="Import" subtitle="Bring your Apple Notes into The Network" />
      {data && !data.aiConfigured && (
        <GlassCard className="mb-4 flex items-start gap-3 border-warm-dormant/40">
          <AlertTriangle className="mt-0.5 shrink-0 text-warm-dormant" size={18} />
          <p className="text-[14px]">AI isn’t configured yet — set <code className="rounded bg-fg/6 px-1">AI_PROVIDER=agent-sdk</code> (your Claude subscription, on your Mac) or an API key in the environment.</p>
        </GlassCard>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-fg-3"><Terminal size={14} /> Step 1 · Export on your Mac</div>
          <p className="text-[14.5px] text-fg-2">In Terminal, inside the project folder, run:</p>
          <pre className="mt-2 overflow-x-auto rounded-[12px] bg-fg/6 px-3 py-2 text-[13px]"><code>pnpm notes:export</code></pre>
          <p className="mt-2 text-[13px] text-fg-3">macOS asks once to let Terminal control Notes — allow it. All notes are exported to <code>.cache/notes-export.json</code>. Nothing leaves your Mac until you drop the file here.</p>
        </GlassCard>
        <GlassCard
          className={cn("flex flex-col items-center justify-center gap-3 border-2 border-dashed text-center transition-colors", drag ? "border-accent bg-accent-soft/40" : "border-[var(--glass-border-2)]")}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        >
          <div className="mb-1 flex items-center gap-2 self-start text-[13px] font-semibold uppercase tracking-wide text-fg-3"><Upload size={14} /> Step 2 · Drop the file</div>
          <FileJson size={36} className="text-accent-strong" />
          <p className="text-[15px] font-medium">{create.isPending ? "Uploading…" : "Drop notes-export.json here"}</p>
          <label className="pressable cursor-pointer rounded-full bg-accent px-4 py-2 text-[14px] font-medium text-accent-fg">
            Choose file
            <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </label>
          {error && <p className="text-[13px] text-danger">{error}</p>}
        </GlassCard>
      </div>

      {data && data.jobs.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wide text-fg-3">Previous imports</h2>
          <GlassCard padded={false} className="p-1.5">
            <ul className="divide-y divide-[var(--glass-border-2)]">
              {data.jobs.map((j) => {
                const c = j.counts;
                const todo = (c.pending ?? 0) + (c.classified ?? 0) + (c.extracted ?? 0);
                return (
                  <li key={j.id}>
                    <Link href={`/import/${j.id}`} className="pressable flex items-center justify-between gap-3 rounded-[14px] px-3 py-2.5 hover:bg-white/50 dark:hover:bg-white/5">
                      <div>
                        <p className="text-[15px] font-medium">{j.label}</p>
                        <p className="text-[12.5px] text-fg-3">{formatDate(j.createdAt)} · {j.totalItems} notes · {c.committed ?? 0} imported · {c.skipped ?? 0} skipped</p>
                      </div>
                      {todo > 0 && <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[12px] font-medium text-accent-strong">{todo} to review</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </GlassCard>
        </section>
      )}
    </>
  );
}
