"use client";
import { ArrowRight, ClipboardPaste, FileJson, Lock, NotebookPen, Upload } from "lucide-react";
import Link from "next/link";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { GlassButton } from "@/components/glass/GlassButton";
import { PageHeader } from "@/components/shell/PageHeader";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import { useReadyData } from "@/lib/offline/useCacheReady";
import { useImportStatus, useIngestExport, type ImportStatus, type IngestResult } from "@/lib/queries/import-review";
import { cn } from "@/lib/utils";
import { QuickImportSheet } from "./QuickImportSheet";
import { ProgressBar, SectionLabel } from "./review/parts";
import { plural } from "./review/text";

const cta = "pressable inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-subhead font-semibold select-none";

export function ImportHome() {
  const [quickOpen, setQuickOpen] = useState(false);
  return (
    <>
      <PageHeader title="Import" subtitle="Bring the people from your notes into The Network." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-3">
          <SectionLabel className="px-1">Sources</SectionLabel>
          <AppleNotesCard />
          <SourceCard
            icon={<ClipboardPaste />}
            tint="var(--palette-sky)"
            title="Paste a note"
            description="From Apple Notes, an email or a call transcript — Claude picks out the people, you confirm, it’s filed."
            action={
              <GlassButton variant="soft" onClick={() => setQuickOpen(true)}>
                Paste a note
              </GlassButton>
            }
          />
          <UploadCard />
        </div>
        <aside className="grid gap-5 md:grid-cols-2 xl:block xl:space-y-5 xl:pt-7">
          <HowItWorks />
        </aside>
      </div>
      <QuickImportSheet open={quickOpen} onOpenChange={setQuickOpen} />
    </>
  );
}

function SourceCard({ icon, tint, title, description, action, children, className }: { icon: ReactNode; tint: string; title: ReactNode; description?: ReactNode; action?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <section className={cn("surface rounded-lg p-4 sm:p-5", className)}>
      <div className="flex items-start gap-3.5">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-sm text-white [&_svg]:size-[22px]" style={{ background: tint }}>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-headline text-fg">{title}</h2>
          {description && <p className="mt-0.5 text-subhead text-fg-2">{description}</p>}
        </div>
        {action && <div className="hidden shrink-0 sm:block">{action}</div>}
      </div>
      {children}
      {action && <div className="mt-3 sm:hidden [&>*]:w-full">{action}</div>}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Apple Notes                                                        */
/* ------------------------------------------------------------------ */

function AppleNotesCard() {
  // Cached status only once it may render (see useCacheReady): server HTML and hydration agree.
  const data = useReadyData(useImportStatus("apple-notes"));
  if (!data)
    return (
      <section className="surface space-y-3 rounded-lg p-4 sm:p-5">
        <div className="flex items-center gap-3.5">
          <Skeleton className="size-11 rounded-sm" />
          <Skeleton className="h-5 w-40 rounded-full" />
        </div>
        <Skeleton className="h-16 w-full rounded-md" />
      </section>
    );
  const p = data.proposals;
  const last = data.commits[0];
  const live = p.total - p.merged;
  const decided = live - p.proposed;
  const subtitle = last ? (
    <>
      Last imported <RelativeTime date={new Date(last.at)} />
    </>
  ) : live ? (
    "Not imported yet"
  ) : (
    "No people found yet"
  );
  const notes = data.items;
  const withPeople = (notes.extracted ?? 0) + (notes.committed ?? 0);
  const waiting = (notes.pending ?? 0) + (notes.classified ?? 0);

  return (
    <SourceCard icon={<NotebookPen />} tint="var(--palette-amber)" title="Apple Notes" description={subtitle} action={<AppleNotesCta status={data} />}>
      {live > 0 && (
        <>
          <dl className="mt-4 grid grid-cols-3 gap-2">
            <Stat label="to review" value={p.proposed} href={p.proposed ? "/import/apple-notes" : undefined} accent={p.proposed > 0} />
            <Stat label="approved" value={p.approved} href="/import/apple-notes?tab=approved" />
            <Stat label="imported" value={p.committed} />
          </dl>
          <ProgressBar value={live ? decided / live : 0} className="mt-3" label="Decided" />
        </>
      )}
      <p className="mt-3 text-footnote text-fg-3">
        {[withPeople && `${plural(withPeople, "note")} with people`, p.rejected && plural(p.rejected, "passer-by", "passers-by"), waiting && `${plural(waiting, "note")} waiting for the pipeline`].filter(Boolean).join(" · ") ||
          "Export your notes and run the import pipeline on your Mac to get started."}
      </p>
    </SourceCard>
  );
}

function AppleNotesCta({ status }: { status: ImportStatus }) {
  const p = status.proposals;
  if (p.proposed > 0)
    return (
      <Link href="/import/apple-notes" className={cn(cta, "bg-accent-fill text-accent-fg specular elevation-e1 hover:brightness-[1.05]")}>
        Review {plural(p.proposed, "person", "people")} <ArrowRight size={16} strokeWidth={2.4} aria-hidden />
      </Link>
    );
  if (p.approved > 0)
    return (
      <Link href="/import/apple-notes?tab=commit" className={cn(cta, "bg-accent-fill text-accent-fg specular elevation-e1 hover:brightness-[1.05]")}>
        Commit {plural(p.approved, "person", "people")}
      </Link>
    );
  if (p.committed > 0)
    return (
      <Link href="/import/apple-notes?tab=commit" className={cn(cta, "bg-fill-2 text-fg hover:bg-fill-3")}>
        Up to date
      </Link>
    );
  return null;
}

function Stat({ label, value, href, accent }: { label: string; value: number; href?: string; accent?: boolean }) {
  const body = (
    <>
      <dd className={cn("text-title2 tabular-nums", accent ? "text-accent-text" : "text-fg")}>{value.toLocaleString("en")}</dd>
      <dt className="text-footnote text-fg-3">{label}</dt>
    </>
  );
  return href ? (
    <Link href={href} className="pressable flex flex-col-reverse rounded-md bg-fill-1 px-3 py-2 hover:bg-fill-2">
      {body}
    </Link>
  ) : (
    <div className="flex flex-col-reverse rounded-md bg-fill-1 px-3 py-2">{body}</div>
  );
}

/* ------------------------------------------------------------------ */
/*  Upload                                                             */
/* ------------------------------------------------------------------ */

const DIFF_LABELS: Record<string, string> = { new: "new", changed: "changed", gone: "deleted", returned: "back", meta: "renamed or moved", locked: "locked", unchanged: "unchanged" };
const DIFF_ORDER = ["new", "changed", "returned", "meta", "locked", "gone"];

/** Ingest counts come as `kind` or `kind:previousStatus`; sum them per kind. */
export function diffByKind(counts: Record<string, number>) {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(counts)) out[k.split(":")[0]!] = (out[k.split(":")[0]!] ?? 0) + v;
  return out;
}

function UploadCard() {
  const ingest = useIngestExport("apple-notes");
  const [drag, setDrag] = useState(false);
  const [rows, setRows] = useState<unknown[] | null>(null);
  const [preview, setPreview] = useState<IngestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const handle = useCallback(
    async (file: File) => {
      setError(null);
      setPreview(null);
      try {
        const parsed = JSON.parse(await file.text()) as unknown;
        if (!Array.isArray(parsed)) throw new Error("Expected the JSON array from pnpm notes:export");
        setRows(parsed);
        setPreview(await ingest.mutateAsync({ rows: parsed, write: false }));
      } catch (e) {
        setRows(null);
        setError(e instanceof SyntaxError ? "That file isn’t valid JSON" : e instanceof Error ? e.message : "Couldn’t read that file");
      }
    },
    [ingest],
  );

  const apply = async () => {
    if (!rows) return;
    try {
      const r = await ingest.mutateAsync({ rows, write: true });
      const byKind = diffByKind(r.counts);
      const staged = (byKind.new ?? 0) + (byKind.changed ?? 0);
      toast.success(staged ? `Added ${plural(staged, "note")} to the import` : "Export applied", {
        description: staged ? "The pipeline on your Mac reads them next (pnpm import:screen); new people then show up for review." : undefined,
        duration: 8000,
      });
      setRows(null);
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t apply the export");
    }
  };

  const kinds = preview ? diffByKind(preview.counts) : {};
  const counts = DIFF_ORDER.filter((k) => (kinds[k] ?? 0) > 0).map((k) => [k, kinds[k]!] as const);
  const known = preview ? Object.values(kinds).reduce((a, b) => a + b, 0) - (kinds.new ?? 0) : 0;
  const manyGone = (kinds.gone ?? 0) > 20 && (kinds.gone ?? 0) > known * 0.25;

  return (
    <section
      className={cn("rounded-lg border-[1.5px] border-dashed p-4 transition-colors sm:p-5", drag ? "border-accent bg-accent-soft" : "border-hairline-strong")}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files[0];
        if (f) void handle(f);
      }}
      aria-label="Upload an Apple Notes export"
    >
      <div className="flex items-start gap-3.5">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-sm bg-fill-2 text-fg-2 [&_svg]:size-[22px]">
          {preview ? <FileJson /> : <Upload />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-headline text-fg">Upload an export</h2>
          <p className="mt-0.5 text-subhead text-fg-2">
            Drop <code className="rounded-xs bg-fill-2 px-1 text-footnote">notes-export.json</code> from <code className="rounded-xs bg-fill-2 px-1 text-footnote">pnpm notes:export</code>. Only new and changed notes are queued; deleted ones are remembered.
          </p>
        </div>
      </div>

      {preview ? (
        <div className="mt-3 space-y-3 rounded-md bg-fill-1 p-3">
          <p className="text-subhead text-fg">
            {plural(preview.notes, "note")} in the export
            {counts.length ? ": " : " — nothing new."}
            {counts.map(([k, v]) => `${v.toLocaleString("en")} ${DIFF_LABELS[k] ?? k}`).join(" · ")}
          </p>
          {preview.staleProposals > 0 && <p className="text-footnote text-fg-3">{plural(preview.staleProposals, "person", "people")} will go back to review because their notes changed.</p>}
          {manyGone && (
            <p role="alert" className="text-footnote text-warning">
              {plural(kinds.gone ?? 0, "note")} would be marked as deleted from Apple Notes. Is this the full export? Nothing is deleted from The Network either way.
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <GlassButton size="sm" variant="ghost" onClick={() => (setPreview(null), setRows(null))}>
              Cancel
            </GlassButton>
            <GlassButton size="sm" variant="primary" loading={ingest.isPending} onClick={() => void apply()} disabled={!counts.length}>
              Apply export
            </GlassButton>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <GlassButton size="sm" variant="surface" loading={ingest.isPending} onClick={() => input.current?.click()}>
            Choose file
          </GlassButton>
          <span className="text-footnote text-fg-3 pointer-coarse:hidden">or drop it here</span>
          <input
            ref={input}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handle(f);
              e.target.value = "";
            }}
          />
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-footnote text-danger">
          {error}
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Explainer                                                          */
/* ------------------------------------------------------------------ */

function HowItWorks() {
  const steps = [
    ["Claude reads your notes", "Every person mentioned is found and matched across notes — “Blažem”, “Blaž” and “Blaž Novak” become one person."],
    ["You confirm the unsure ones", "Clear cases are approved automatically. You decide the rest, one card at a time — keyboard on Mac, swipes on iPhone."],
    ["Commit when you’re ready", "People, notes, reminders and tags are created in one go. Any import can be undone."],
  ];
  return (
    <>
      <section className="space-y-3">
        <SectionLabel className="px-1">How it works</SectionLabel>
        <ol className="space-y-3">
          {steps.map(([title, body], i) => (
            <li key={title} className="flex gap-3">
              <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-caption font-bold text-accent-text">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-subhead font-semibold text-fg">{title}</p>
                <p className="mt-0.5 text-footnote text-fg-2">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section className="flex gap-3 rounded-md bg-fill-1 p-3.5">
        <Lock size={16} strokeWidth={2.2} className="mt-0.5 shrink-0 text-fg-3" aria-hidden />
        <p className="text-footnote text-fg-2">
          Notes are only sent to the AI provider you configured, to find the people in them. Imports never overwrite what you wrote — existing people only get blanks filled.
        </p>
      </section>
    </>
  );
}
