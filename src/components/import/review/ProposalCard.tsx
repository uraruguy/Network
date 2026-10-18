"use client";
import { Briefcase, Link2, MapPin, Merge, Pencil, Undo2, UserCheck, UserX, Users } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Avatar } from "@/components/glass/Avatar";
import { Chip } from "@/components/glass/Chip";
import { GlassButton } from "@/components/glass/GlassButton";
import { Switch } from "@/components/ui/Switch";
import type { CATEGORY_SLUGS } from "@/lib/import/contracts";
import type { Proposal } from "@/lib/queries/import-review";
import { cn } from "@/lib/utils";
import { EvidenceSection } from "./Evidence";
import { CategoryChips, FlagList, Kbd, SectionLabel } from "./parts";
import type { Verdict } from "./state";
import { avatarName, flagSentences, placeLabel } from "./text";

export type SimilarEntry = Proposal["similar"][number];

export type ProposalCardProps = {
  proposal: Proposal;
  /** Decided in this session: the card turns read-only and shows the verdict. */
  verdict?: Verdict | null;
  verdictLabel?: string | null;
  onRename?: (name: string) => void;
  onToggleCategory?: (slug: (typeof CATEGORY_SLUGS)[number]) => void;
  onToggleReminder?: (on: boolean) => void;
  onQuickMerge?: (target: SimilarEntry) => void;
  onUndo?: () => void;
  /** Bumps to focus the name field (the R shortcut). */
  renameSignal?: number;
  showKeys?: boolean;
  /** No card chrome (inside a sheet). */
  bare?: boolean;
  className?: string;
};

const VERDICT_META: Record<Verdict, { label: string; icon: ReactNode; className: string }> = {
  approve: { label: "Approved", icon: <UserCheck size={16} strokeWidth={2.4} />, className: "bg-success-soft text-success" },
  reject: { label: "Not a person", icon: <UserX size={16} strokeWidth={2.4} />, className: "bg-danger-soft text-danger" },
  passerby: { label: "Passer-by", icon: <Users size={16} strokeWidth={2.4} />, className: "bg-fill-2 text-fg-2" },
  merge: { label: "Merged", icon: <Merge size={16} strokeWidth={2.4} />, className: "bg-accent-soft text-accent-text" },
};

/** One person to confirm: name, aliases, facts, categories, follow-up, evidence and look-alikes. */
export function ProposalCard({ proposal: p, verdict, verdictLabel, onRename, onToggleCategory, onToggleReminder, onQuickMerge, onUndo, renameSignal, showKeys, bare, className }: ProposalCardProps) {
  const readOnly = !!verdict || !onRename;
  const terms = [p.displayName, ...p.aliases];
  const place = placeLabel(p.place, p.profile.city);
  const flags = flagSentences({ ...p, matchPerson: p.matchPerson, similar: p.similar });
  const facts = [p.profile.role, p.profile.company].filter(Boolean);
  const followUp = p.profile.followUps[0];
  const similar = p.similar.filter((s) => s.id !== p.matchPerson?.id).slice(0, 4);

  return (
    <article aria-label={p.displayName} className={cn(!bare && "surface rounded-xl p-4 sm:p-6", className)}>
      {verdict && (
        <div className={cn("-mx-1 -mt-1 mb-4 flex min-h-11 items-center gap-2 rounded-md px-3 text-subhead font-semibold", VERDICT_META[verdict].className)}>
          {VERDICT_META[verdict].icon}
          <span className="min-w-0 flex-1 truncate">{verdictLabel ?? VERDICT_META[verdict].label}</span>
          {onUndo && (
            <GlassButton size="sm" variant="plain" onClick={onUndo} className="text-current">
              <Undo2 size={14} strokeWidth={2.4} /> Undo
            </GlassButton>
          )}
        </div>
      )}

      <header className="flex items-start gap-3.5">
        <Avatar name={avatarName(p.displayName)} size={56} />
        <div className="min-w-0 flex-1">
          <NameField name={p.displayName} readOnly={readOnly} onRename={onRename} focusSignal={renameSignal} showKeys={showKeys} />
          {p.aliases.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1" aria-label="Also written as">
              {p.aliases.slice(0, 6).map((a) => (
                <Chip key={a} size="sm">
                  {a}
                </Chip>
              ))}
              {p.aliases.length > 6 && <Chip size="sm">+{p.aliases.length - 6}</Chip>}
            </div>
          )}
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-subhead text-fg-2">
            {facts.length > 0 && (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <Briefcase size={15} strokeWidth={2.2} className="shrink-0 text-fg-3" aria-hidden />
                <span className="min-w-0">{facts.join(" · ")}</span>
              </span>
            )}
            {place && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin size={15} strokeWidth={2.2} className="shrink-0 text-fg-3" aria-hidden />
                {place}
              </span>
            )}
            {!facts.length && !place && <span className="text-fg-3">No role or place in the notes</span>}
          </p>
        </div>
      </header>

      {p.matchPerson && (
        <p className="mt-3 flex items-center gap-2 rounded-md bg-accent-soft px-3 py-2 text-subhead text-accent-text">
          <Link2 size={16} strokeWidth={2.2} className="shrink-0" aria-hidden />
          <span>
            Adds to <strong className="font-semibold">{p.matchPerson.displayName}</strong>, already in The Network
          </span>
        </p>
      )}

      {flags.length > 0 && (
        <div className="mt-4">
          <FlagList flags={flags} />
        </div>
      )}

      {p.profile.keyFacts.length > 0 && (
        <ul className="mt-4 space-y-1 text-subhead text-fg-2">
          {p.profile.keyFacts.slice(0, 3).map((f) => (
            <li key={f} className="flex gap-2">
              <span aria-hidden className="mt-[0.55em] size-1 shrink-0 rounded-full bg-fg-4" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 space-y-2">
        <SectionLabel>Categories</SectionLabel>
        <CategoryChips value={p.profile.categories} onToggle={(s) => onToggleCategory?.(s)} disabled={readOnly || !onToggleCategory} showKeys={showKeys && !readOnly} />
      </div>

      {p.profile.activities.length > 0 && (
        <div className="mt-4 space-y-2">
          <SectionLabel>Activities</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {p.profile.activities.map((a) => (
              <Chip key={a} size="sm" color="var(--palette-green)">
                {a}
              </Chip>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 rounded-md bg-fill-1 px-3.5 py-1.5">
        <Switch
          label={
            <span className="flex items-center gap-2">
              Create follow-up
              {showKeys && !readOnly && followUp && <Kbd decorative>F</Kbd>}
            </span>
          }
          description={followUp ? (p.createReminder ? `Reminder: ${followUp.what}${followUp.when ? ` · ${followUp.when}` : ""}` : `Kept as an open thread: ${followUp.what}`) : "No follow-ups in these notes"}
          checked={!!followUp && p.createReminder}
          disabled={readOnly || !followUp || !onToggleReminder}
          onCheckedChange={(on) => onToggleReminder?.(on)}
        />
      </div>

      <div className="mt-5">
        <EvidenceSection key={p.id} proposalId={p.id} evidence={p.evidence} total={p.mentionCount} terms={terms} />
      </div>

      {similar.length > 0 && (
        <section className="mt-5 space-y-2" aria-label="Similar people">
          <SectionLabel>Similar people</SectionLabel>
          <ul className="surface divide-y-[0.5px] divide-separator overflow-hidden rounded-md">
            {similar.map((s) => (
              <li key={`${s.kind}:${s.id}`} className="flex min-h-14 items-center gap-3 px-3 py-2">
                <Avatar name={avatarName(s.displayName)} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-subhead font-medium text-fg">{s.displayName}</p>
                  <p className="truncate text-footnote text-fg-3">{similarDetail(s)}</p>
                </div>
                {onQuickMerge && !readOnly && s.detail !== "merged" && (
                  <GlassButton size="sm" variant="soft" onClick={() => onQuickMerge(s)} aria-label={`Merge into ${s.displayName}`}>
                    <Merge size={14} strokeWidth={2.4} /> Merge
                  </GlassButton>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {p.reasons && (
        <p className="mt-4 text-footnote text-fg-3">
          <span className="font-medium text-fg-2">Why: </span>
          {p.reasons.replace(/\s*\[possible same as:[^\]]*\]/gi, "").trim() || "—"}
          {p.confidence != null && ` · ${Math.round(p.confidence * 100)}% sure`}
        </p>
      )}
    </article>
  );
}

function similarDetail(s: SimilarEntry) {
  if (s.kind === "person") return ["In The Network", s.detail].filter(Boolean).join(" · ");
  const status: Record<string, string> = { proposed: "Also to review", approved: "Approved proposal", rejected: "Skipped proposal", committed: "Imported" };
  return status[s.detail ?? ""] ?? "Proposal";
}

/** Inline-editable name: reads as a title, edits in place (Enter saves, Escape cancels). */
function NameField({ name, readOnly, onRename, focusSignal, showKeys }: { name: string; readOnly: boolean; onRename?: (n: string) => void; focusSignal?: number; showKeys?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const input = useRef<HTMLInputElement>(null);
  // The R shortcut bumps `focusSignal`: start editing (state adjusted during render, no effect).
  const [seenSignal, setSeenSignal] = useState(focusSignal);
  if (focusSignal !== seenSignal) {
    setSeenSignal(focusSignal);
    if (!readOnly) {
      setDraft(name);
      setEditing(true);
    }
  }

  useEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    }
  }, [editing]);

  const commit = () => {
    const next = draft.trim().replace(/\s+/g, " ");
    setEditing(false);
    if (next && next !== name) onRename?.(next);
  };

  if (editing)
    return (
      <input
        ref={input}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            setDraft(name);
            setEditing(false);
          }
        }}
        aria-label="Name"
        maxLength={200}
        className="-mx-1.5 -my-0.5 w-[calc(100%+12px)] rounded-xs bg-surface-2 px-1.5 py-0.5 text-title2 text-fg shadow-[0_0_0_3px_var(--focus-ring)] outline-none"
      />
    );
  if (readOnly) return <h2 className="text-title2 break-words text-fg">{name}</h2>;
  return (
    <h2 className="text-title2 text-fg">
      <button
        type="button"
        onClick={() => {
          setDraft(name);
          setEditing(true);
        }}
        className="group/name -mx-1.5 -my-0.5 flex max-w-full items-center gap-2 rounded-xs px-1.5 py-0.5 text-left hover:bg-fill-1"
        title="Rename"
      >
        <span className="min-w-0 break-words">{name}</span>
        <Pencil size={15} strokeWidth={2.2} className="shrink-0 text-fg-4 opacity-0 transition-opacity group-hover/name:opacity-100 group-focus-visible/name:opacity-100 pointer-coarse:opacity-100" aria-hidden />
        {showKeys && (
          <Kbd decorative className="opacity-0 group-hover/name:opacity-100">
            R
          </Kbd>
        )}
        <span className="sr-only">(rename)</span>
      </button>
    </h2>
  );
}
