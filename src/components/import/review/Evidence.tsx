"use client";
import { ChevronDown, FileText, Folder } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { SkeletonText } from "@/components/ui/Skeleton";
import { collapse } from "@/lib/motion";
import { useImportItem, useProposalDetail, type Evidence as EvidenceRow } from "@/lib/queries/import-review";
import { cn, formatDate } from "@/lib/utils";
import { Highlighted, SectionLabel } from "./parts";
import { focusSnippet, plural } from "./text";

/** Up to three snippets (name highlighted) with note title · date · folder; "All N notes" expands. */
export function EvidenceSection({ proposalId, evidence, total, terms }: { proposalId: string; evidence: EvidenceRow[]; total: number; terms: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const [openItem, setOpenItem] = useState<EvidenceRow | null>(null);
  const detail = useProposalDetail(proposalId, { enabled: expanded });
  const rows = expanded && detail.data ? detail.data.evidence : evidence;
  const more = total - evidence.length;

  return (
    <section className="space-y-2" aria-label="Evidence">
      <SectionLabel>
        {plural(total, "note")}
      </SectionLabel>
      {rows.length === 0 ? (
        <p className="text-subhead text-fg-3">No notes are linked to this person any more.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.slice(0, 3).map((e) => (
            <li key={e.mentionId}>
              <SnippetButton e={e} terms={terms} onOpen={() => setOpenItem(e)} />
            </li>
          ))}
          <AnimatePresence initial={false}>
            {expanded && rows.length > 3 && (
              <motion.li key="more" variants={collapse} initial="initial" animate="animate" exit="exit" className="overflow-hidden">
                <ul className="space-y-1.5">
                  {rows.slice(3).map((e) => (
                    <li key={e.mentionId}>
                      <SnippetButton e={e} terms={terms} onOpen={() => setOpenItem(e)} />
                    </li>
                  ))}
                </ul>
              </motion.li>
            )}
          </AnimatePresence>
        </ul>
      )}
      {more > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          aria-expanded={expanded}
          className="pressable hit-44 inline-flex h-8 items-center gap-1 rounded-full px-2 text-subhead font-medium text-accent-text hover:bg-accent-soft"
        >
          {expanded ? "Show fewer" : `All ${plural(total, "note")}`}
          <ChevronDown size={16} strokeWidth={2.4} className={cn("transition-transform duration-200", expanded && "rotate-180")} aria-hidden />
        </button>
      )}
      {expanded && detail.isLoading && <SkeletonText lines={2} />}
      <NoteDialog item={openItem} terms={terms} onClose={() => setOpenItem(null)} />
    </section>
  );
}

function SnippetButton({ e, terms, onOpen }: { e: EvidenceRow; terms: string[]; onOpen: () => void }) {
  const snippet = e.snippet ? focusSnippet(e.snippet, [...terms, e.surface]) : null;
  const folder = e.folders?.[0];
  return (
    <button
      type="button"
      onClick={onOpen}
      className="pressable group/snip block w-full rounded-md bg-fill-1 px-3 py-2.5 text-left hover:bg-fill-2"
    >
      <p className="line-clamp-3 text-subhead text-fg">
        {snippet ? <Highlighted text={snippet} terms={[...terms, e.surface]} /> : <span className="text-fg-2">Mentioned as “{e.surface}”</span>}
      </p>
      <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-footnote text-fg-3">
        <FileText size={13} strokeWidth={2.2} className="shrink-0" aria-hidden />
        <span className="max-w-full truncate font-medium text-fg-2">{e.title?.trim() || "Untitled note"}</span>
        <span aria-hidden>·</span>
        <span className="shrink-0">{formatDate(e.date, { day: "numeric", month: "short", year: "numeric" })}</span>
        {folder && (
          <>
            <span aria-hidden>·</span>
            <Folder size={13} strokeWidth={2.2} className="shrink-0" aria-hidden />
            <span className="truncate">{folder}</span>
          </>
        )}
        {e.role === "primary" && <span className="ml-auto shrink-0 rounded-full bg-accent-soft px-1.5 text-caption2 font-semibold text-accent-text">Filed here</span>}
        {e.gone && <span className="ml-auto shrink-0 rounded-full bg-warning-soft px-1.5 text-caption2 font-semibold text-warning">Deleted</span>}
      </p>
    </button>
  );
}

/** The full note, lazily loaded, with the person's name highlighted. */
export function NoteDialog({ item, terms, onClose }: { item: { itemId: string; title: string | null; surface?: string } | null; terms: string[]; onClose: () => void }) {
  const q = useImportItem(item?.itemId ?? null);
  const allTerms = item?.surface ? [...terms, item.surface] : terms;
  return (
    <Dialog
      open={!!item}
      onOpenChange={(o) => !o && onClose()}
      width={640}
      title={item?.title?.trim() || "Untitled note"}
      description={
        q.data ? (
          <span>
            {formatDate(q.data.externalCreatedAt ?? undefined, { day: "numeric", month: "long", year: "numeric" })}
            {q.data.folders.length ? ` · ${q.data.folders.join(", ")}` : ""}
          </span>
        ) : undefined
      }
      className="max-h-[min(85dvh,820px)]"
    >
      {q.isLoading || !q.data ? (
        <SkeletonText lines={6} />
      ) : (
        <div className="max-h-[60dvh] overflow-y-auto pr-1">
          <p className="text-body whitespace-pre-wrap text-fg">
            <Highlighted text={q.data.text} terms={allTerms} />
          </p>
          {q.data.mentions.length > 0 && (
            <p className="mt-4 border-t-[0.5px] border-separator pt-3 text-footnote text-fg-3">
              People in this note: {[...new Set(q.data.mentions.map((m) => m.displayName ?? m.surface))].join(", ")}
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}
