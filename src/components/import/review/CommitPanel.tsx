"use client";
import { AlertTriangle, CheckCircle2, History, RefreshCw, Undo2, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { GlassButton } from "@/components/glass/GlassButton";
import { confirm } from "@/components/ui/confirm";
import { EmptyState } from "@/components/ui/EmptyState";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import { useCommitImport, useImportStatus, useRollbackCommit, type CommitResult } from "@/lib/queries/import-review";
import { cn } from "@/lib/utils";
import { BatchCards } from "./BatchCards";
import { ProgressBar, SectionLabel } from "./parts";
import { plural } from "./text";

export const COMMIT_CHUNK = 20;

type Totals = { created: number; updated: number; notes: number; excerpts: number; reminders: number; failed: string[] };
type Phase = { kind: "idle" } | { kind: "checking" } | { kind: "ready"; dry: CommitResult } | { kind: "running"; done: number; total: number; totals: Totals } | { kind: "done"; commitId: string; totals: Totals } | { kind: "error"; message: string };

const emptyTotals = (): Totals => ({ created: 0, updated: 0, notes: 0, excerpts: 0, reminders: 0, failed: [] });

/** "Create 214 · merge into existing 3 · file 268 notes · 41 excerpts · 12 reminders · 9 new activities · 4 tags" */
export function commitSummary(r: Pick<CommitResult, "people" | "notes" | "reminders" | "log">): string[] {
  const parts: string[] = [];
  if (r.people.created) parts.push(`Create ${r.people.created.toLocaleString("en")}`);
  const merged = r.people.updated + r.people.unchanged;
  if (merged) parts.push(`merge into existing ${merged.toLocaleString("en")}`);
  const filed = r.notes.created + r.notes.updated;
  if (filed) parts.push(`file ${plural(filed, "note")}`);
  if (r.notes.excerpts) parts.push(plural(r.notes.excerpts, "excerpt"));
  if (r.reminders) parts.push(plural(r.reminders, "reminder"));
  const acts = r.log["activities:insert"] ?? 0;
  if (acts) parts.push(`${acts.toLocaleString("en")} new ${acts === 1 ? "activity" : "activities"}`);
  const tags = r.log["tags:insert"] ?? 0;
  if (tags) parts.push(plural(tags, "tag"));
  if (parts[0] && !r.people.created) parts[0] = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  return parts;
}

/** Dry run → summary → chunked commit with progress → "Imported · Undo import". */
export function CommitPanel({ source, onReview }: { source: string; onReview: () => void }) {
  const status = useImportStatus(source);
  const commit = useCommitImport(source);
  const rollback = useRollbackCommit();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const running = phase.kind === "running";
  const approved = status.data?.proposals.approved ?? 0;
  const toReview = status.data?.proposals.proposed ?? 0;
  const mutate = commit.mutateAsync;

  const check = useCallback(async () => {
    setPhase({ kind: "checking" });
    try {
      const dry = await mutate({ dryRun: true });
      setPhase({ kind: "ready", dry });
    } catch (e) {
      setPhase({ kind: "error", message: e instanceof Error ? e.message : "The dry run failed" });
    }
  }, [mutate]);

  // Dry run on open and whenever the number of approved people changes (not while committing).
  const lastApproved = useRef<number | null>(null);
  useEffect(() => {
    if (!status.data || running || phase.kind === "done" || phase.kind === "checking") return;
    if (lastApproved.current === approved && phase.kind !== "idle") return;
    lastApproved.current = approved;
    void check();
  }, [status.data, approved, running, phase.kind, check]);

  const undoImport = useCallback(
    async (commitId: string, label = "import") => {
      try {
        const r = await rollback.mutateAsync({ commitId, dryRun: false });
        const removed = (r.reverted["people:insert"] ?? 0) + (r.reverted["notes:insert"] ?? 0);
        toast.success(`Undid the ${label}`, { description: removed ? `Removed ${plural(r.reverted["people:insert"] ?? 0, "person", "people")} and ${plural(r.reverted["notes:insert"] ?? 0, "note")}.` : undefined });
        setPhase({ kind: "idle" });
        lastApproved.current = null;
      } catch (e) {
        toast.error("Couldn’t undo the import", { description: e instanceof Error ? e.message : undefined, duration: 10_000 });
      }
    },
    [rollback],
  );

  const run = async (dry: CommitResult) => {
    const keys = dry.keys ?? [];
    const commitId = crypto.randomUUID();
    const chunks: (string[] | undefined)[] = [];
    for (let i = 0; i < keys.length; i += COMMIT_CHUNK) chunks.push(keys.slice(i, i + COMMIT_CHUNK));
    if (!chunks.length) chunks.push(undefined); // notes only (their people are already in The Network)
    const totals = emptyTotals();
    setPhase({ kind: "running", done: 0, total: keys.length, totals });
    try {
      let done = 0;
      for (const chunk of chunks) {
        const r = await mutate({ dryRun: false, keys: chunk, commitId });
        totals.created += r.people.created;
        totals.updated += r.people.updated + r.people.unchanged;
        totals.notes += r.notes.created + r.notes.updated;
        totals.excerpts += r.notes.excerpts;
        totals.reminders += r.reminders;
        totals.failed.push(...r.people.failed.map((f) => `${f.key}: ${f.error}`), ...r.notes.failed.map((f) => `${f.title ?? "Note"}: ${f.error}`));
        done += chunk?.length ?? 0;
        setPhase({ kind: "running", done, total: keys.length, totals: { ...totals } });
      }
      setPhase({ kind: "done", commitId, totals: { ...totals } });
      const people = totals.created + totals.updated;
      toast({
        type: "success",
        title: `Imported ${plural(people, "person", "people")}`,
        description: totals.notes ? `${plural(totals.notes, "note")} filed` : undefined,
        duration: 12_000,
        action: { label: "Undo import", onClick: () => void undoImport(commitId) },
      });
    } catch (e) {
      // Chunks that finished stay committed under the same id — they can be undone together.
      setPhase({ kind: "done", commitId, totals: { ...totals, failed: [...totals.failed, e instanceof Error ? e.message : "Commit failed"] } });
      toast.error("The import stopped part-way", { description: "Everything committed so far can be undone in one go.", duration: 10_000 });
    }
  };

  const commits = status.data?.commits ?? [];

  return (
    <div className="mx-auto w-full max-w-[640px] space-y-5">
      <BatchCards source={source} />

      <section className="surface rounded-xl p-5 sm:p-6" aria-live="polite">
        {phase.kind === "checking" || phase.kind === "idle" ? (
          <div className="space-y-3">
            <p className="text-subhead text-fg-2">Checking what would change…</p>
            <Skeleton className="h-6 w-4/5 rounded-full" />
            <Skeleton className="h-11 w-48 rounded-full" />
          </div>
        ) : phase.kind === "error" ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-headline text-danger">
              <AlertTriangle size={18} strokeWidth={2.4} /> Couldn’t prepare the import
            </p>
            <p className="text-subhead text-fg-2">{phase.message}</p>
            <GlassButton onClick={() => void check()}>
              <RefreshCw size={16} /> Try again
            </GlassButton>
          </div>
        ) : phase.kind === "ready" ? (
          <ReadyView dry={phase.dry} toReview={toReview} onReview={onReview} onCommit={() => void run(phase.dry)} onRecheck={() => void check()} />
        ) : phase.kind === "running" ? (
          <div className="space-y-3">
            <p className="text-headline text-fg">Importing…</p>
            <ProgressBar value={phase.total ? phase.done / phase.total : 0.5} label="Import progress" className="h-2" />
            <p className="text-subhead text-fg-2 tabular-nums">
              {phase.done.toLocaleString("en")} / {plural(phase.total, "person", "people")} · {plural(phase.totals.notes, "note")} filed
            </p>
            <p className="text-footnote text-fg-3">Keep this tab open — it takes a few seconds per 20 people.</p>
          </div>
        ) : (
          <DoneView totals={phase.totals} onUndo={() => void undoImport(phase.commitId)} undoing={rollback.isPending} onAgain={() => { lastApproved.current = null; setPhase({ kind: "idle" }); }} />
        )}
      </section>

      {commits.length > 0 && (
        <section className="space-y-2">
          <SectionLabel>Recent imports</SectionLabel>
          <ul className="surface divide-y-[0.5px] divide-separator overflow-hidden rounded-lg">
            {commits.slice(0, 5).map((c) => (
              <li key={c.commit_id} className="flex min-h-14 items-center gap-3 px-4 py-2">
                <History size={18} strokeWidth={2.2} className="shrink-0 text-fg-3" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-subhead text-fg">
                    +{plural(c.people_created, "person", "people")} · +{plural(c.notes_created, "note")}
                  </p>
                  <p className="text-footnote text-fg-3">
                    <RelativeTime date={new Date(c.at)} />
                  </p>
                </div>
                <GlassButton
                  size="sm"
                  variant="ghost"
                  disabled={running || rollback.isPending}
                  onClick={async () => {
                    const ok = await confirm({
                      title: "Undo this import?",
                      message: `The ${plural(c.people_created, "person", "people")} and ${plural(c.notes_created, "note")} it created are removed; people it only added to go back to how they were.`,
                      confirmLabel: "Undo import",
                      destructive: true,
                    });
                    if (ok) await undoImport(c.commit_id);
                  }}
                >
                  <Undo2 size={14} strokeWidth={2.4} /> Undo
                </GlassButton>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ReadyView({ dry, toReview, onReview, onCommit, onRecheck }: { dry: CommitResult; toReview: number; onReview: () => void; onCommit: () => void; onRecheck: () => void }) {
  const parts = commitSummary(dry);
  const people = dry.keys?.length ?? 0;
  const filed = dry.notes.created + dry.notes.updated + dry.notes.excerpts;
  if (!people && !filed)
    return (
      <EmptyState
        compact
        icon={<CheckCircle2 />}
        title={toReview ? "Nothing to import yet" : "Everything is imported"}
        description={toReview ? `Approve people first — ${plural(toReview, "person", "people")} still to review.` : "Everyone approved is already in The Network."}
        action={
          toReview ? (
            <GlassButton variant="primary" size="sm" onClick={onReview}>
              Review {plural(toReview, "person", "people")}
            </GlassButton>
          ) : undefined
        }
      />
    );
  const failed = dry.people.failed.length + dry.notes.failed.length;
  return (
    <div className="space-y-4">
      <div>
        <p className="text-footnote font-semibold tracking-[0.02em] text-fg-3 uppercase">Ready to import</p>
        <p className="mt-1.5 text-title3 text-balance text-fg">{parts.join(" · ") || "Nothing changes"}</p>
      </div>
      <ul className="space-y-1.5 text-subhead text-fg-2">
        {toReview > 0 && (
          <li className="flex items-start gap-2">
            <Users size={16} strokeWidth={2.2} className="mt-0.5 shrink-0 text-fg-3" aria-hidden />
            <span>
              {plural(toReview, "person", "people")} still to review will wait for the next import.{" "}
              <button type="button" onClick={onReview} className="font-medium text-accent-text hover:underline">
                Review now
              </button>
            </span>
          </li>
        )}
        {dry.notes.waiting > 0 && (
          <li className="flex items-start gap-2">
            <History size={16} strokeWidth={2.2} className="mt-0.5 shrink-0 text-fg-3" aria-hidden />
            <span>{plural(dry.notes.waiting, "note")} wait for people you haven’t decided yet.</span>
          </li>
        )}
        {failed > 0 && (
          <li className="flex items-start gap-2 text-danger">
            <AlertTriangle size={16} strokeWidth={2.2} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              {plural(failed, "item")} would fail: {[...dry.people.failed.map((f) => f.key), ...dry.notes.failed.map((f) => f.title ?? "note")].slice(0, 3).join(", ")}
            </span>
          </li>
        )}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <GlassButton variant="primary" size="lg" onClick={onCommit} className="max-sm:w-full">
          {people ? `Commit ${plural(people, "person", "people")}` : `File ${plural(filed, "note")}`}
        </GlassButton>
        <GlassButton variant="ghost" onClick={onRecheck}>
          <RefreshCw size={16} /> Check again
        </GlassButton>
      </div>
      <p className="text-footnote text-fg-3">Nothing is overwritten: existing people only get blanks filled. You can undo the whole import afterwards.</p>
    </div>
  );
}

function DoneView({ totals, onUndo, undoing, onAgain }: { totals: Totals; onUndo: () => void; undoing: boolean; onAgain: () => void }) {
  const people = totals.created + totals.updated;
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-success-soft text-success">
          <CheckCircle2 size={24} strokeWidth={2.2} />
        </span>
        <div className="min-w-0">
          <p className="text-title3 text-fg">Imported {plural(people, "person", "people")}</p>
          <p className="mt-0.5 text-subhead text-fg-2">
            {[totals.created && `${totals.created} new`, totals.updated && `${totals.updated} added to existing people`, totals.notes && `${plural(totals.notes, "note")} filed`, totals.excerpts && plural(totals.excerpts, "excerpt"), totals.reminders && plural(totals.reminders, "reminder")]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>
      {totals.failed.length > 0 && (
        <details className="rounded-md bg-danger-soft px-3 py-2 text-footnote text-danger">
          <summary className="cursor-pointer font-medium">{plural(totals.failed.length, "problem")}</summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {totals.failed.slice(0, 20).map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </details>
      )}
      <div className={cn("flex flex-wrap gap-2")}>
        <Link href="/people" className="pressable inline-flex h-11 items-center justify-center rounded-full bg-accent-fill px-5 text-subhead font-semibold text-accent-fg specular elevation-e1">
          Open People
        </Link>
        <GlassButton variant="danger" onClick={onUndo} loading={undoing}>
          <Undo2 size={16} strokeWidth={2.4} /> Undo import
        </GlassButton>
        <GlassButton variant="ghost" onClick={onAgain}>
          Check again
        </GlassButton>
      </div>
    </div>
  );
}
