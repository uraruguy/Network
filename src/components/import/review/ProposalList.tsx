"use client";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, RotateCcw, UserCheck, UserX, Users } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/glass/Avatar";
import { GlassButton } from "@/components/glass/GlassButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Sheet } from "@/components/ui/Sheet";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import { importKeys, useDecideProposal, useImportStatus, useProposals, type DecideVars, type ImportStatus, type Proposal } from "@/lib/queries/import-review";
import { cn } from "@/lib/utils";
import { ProposalCard } from "./ProposalCard";
import { avatarName, placeLabel, plural } from "./text";

type ListTab = "approved" | "rejected";

function approvedSummary(p: ImportStatus["proposals"] | undefined) {
  if (!p) return "";
  const you = p.approved - p.autoApproved;
  return `${p.autoApproved.toLocaleString("en")} approved by Claude${you > 0 ? `, ${you.toLocaleString("en")} by you` : ""}. `;
}

const DISPOSITION: Record<string, string> = { passerby: "Passer-by", not_person: "Not a person", self: "You", person: "Not a person" };

/** Approved / passers-by: a scannable list to audit Claude's automatic decisions. */
export function ProposalList({ source, tab }: { source: string; tab: ListTab }) {
  const qc = useQueryClient();
  const q = useProposals(tab, source);
  const decide = useDecideProposal(source);
  const [open, setOpen] = useState<Proposal | null>(null);
  const status = useImportStatus(source);
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];

  const act = (p: Proposal, input: DecideVars, receipt: string) => {
    setOpen(null);
    decide.mutate(input, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: importKeys.queue(source) });
        qc.invalidateQueries({ queryKey: importKeys.proposals(source, tab) });
        toast.undo(receipt, () =>
          decide.mutate(
            { id: p.id, action: "undo" },
            {
              onSuccess: () => {
                qc.invalidateQueries({ queryKey: importKeys.queue(source) });
                qc.invalidateQueries({ queryKey: importKeys.proposals(source, tab) });
              },
              onError: (e) => toast.error("Couldn’t undo", { description: e.message }),
            },
          ),
        );
      },
      onError: (e) => toast.error("Couldn’t save", { description: e.message }),
    });
  };

  const reopen = (p: Proposal) => act(p, { id: p.id, action: "reopen" }, `${p.displayName} is back in To review`);

  if (q.isLoading)
    return (
      <div className="surface mx-auto max-w-[720px] overflow-hidden rounded-lg">
        <SkeletonRows count={6} />
      </div>
    );
  if (!rows.length)
    return (
      <EmptyState
        icon={tab === "approved" ? <UserCheck /> : <Users />}
        title={tab === "approved" ? "No approved people yet" : "No passers-by"}
        description={tab === "approved" ? "People Claude is sure about — and the ones you approve — show up here before they’re imported." : "Waiters, drivers and other one-off mentions Claude skipped show up here."}
      />
    );

  return (
    <div className="mx-auto w-full max-w-[720px] space-y-3">
      <p className="px-1 text-footnote text-fg-3">
        {tab === "approved"
          ? `${approvedSummary(status.data?.proposals)}Tap someone to check them; send anyone you’re unsure about back to review.`
          : "Skipped automatically or by you. Rescue anyone who deserves a card."}
      </p>
      <ul className="surface divide-y-[0.5px] divide-separator overflow-hidden rounded-lg">
        {rows.map((p) => {
          const sub = [p.profile.role, p.profile.company, placeLabel(p.place, p.profile.city), plural(p.mentionCount, "note")].filter(Boolean).join(" · ");
          return (
            <li key={p.id} className="flex items-center gap-3 pr-3">
              <button type="button" onClick={() => setOpen(p)} className="flex min-h-[60px] min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left transition-colors hover:bg-fill-1 active:bg-fill-2">
                <Avatar name={avatarName(p.displayName)} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-body text-fg">{p.displayName}</span>
                    {tab === "rejected" && <span className="shrink-0 rounded-full bg-fill-2 px-2 text-caption font-medium text-fg-2">{DISPOSITION[p.disposition] ?? p.disposition}</span>}
                    {p.decidedBy === "user" && <span className="shrink-0 rounded-full bg-accent-soft px-2 text-caption font-medium text-accent-text">You</span>}
                  </span>
                  <span className="mt-0.5 block truncate text-footnote text-fg-3">{sub}</span>
                </span>
              </button>
              {tab === "rejected" ? (
                <GlassButton size="sm" variant="soft" onClick={() => act(p, { id: p.id, action: "approve" }, `Approved ${p.displayName}`)} aria-label={`Approve ${p.displayName}`}>
                  <UserCheck size={14} strokeWidth={2.4} /> Approve
                </GlassButton>
              ) : (
                <GlassButton size="sm" variant="ghost" onClick={() => reopen(p)} aria-label={`Send ${p.displayName} back to review`}>
                  <RotateCcw size={14} strokeWidth={2.4} /> Review
                </GlassButton>
              )}
            </li>
          );
        })}
      </ul>
      {q.hasNextPage && (
        <div className="flex justify-center">
          <GlassButton variant="ghost" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
            Show more
          </GlassButton>
        </div>
      )}

      <Sheet
        open={!!open}
        onOpenChange={(o) => !o && setOpen(null)}
        title={open ? (tab === "approved" ? (open.decidedBy === "user" ? "Approved by you" : "Approved by Claude") : (DISPOSITION[open.disposition] ?? "Skipped")) : undefined}
        size="large"
        width={640}
        footer={
          open && (
            <div className={cn("flex flex-wrap justify-end gap-2")}>
              <GlassButton variant="ghost" onClick={() => reopen(open)}>
                <RotateCcw size={16} /> Send to review
              </GlassButton>
              {tab === "approved" ? (
                <GlassButton variant="danger" onClick={() => act(open, { id: open.id, action: "reject" }, `${open.displayName} — not a person`)}>
                  <UserX size={16} /> Not a person
                </GlassButton>
              ) : (
                <GlassButton variant="primary" onClick={() => act(open, { id: open.id, action: "approve" }, `Approved ${open.displayName}`)}>
                  <CheckCircle2 size={16} /> Approve
                </GlassButton>
              )}
            </div>
          )
        }
      >
        {open && <ProposalCard proposal={open} bare />}
      </Sheet>
    </div>
  );
}
