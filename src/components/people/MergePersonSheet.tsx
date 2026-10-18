"use client";
/**
 * "Merge with…": two cards for one person become one. Pick the other card, choose which one
 * stays, see what moves onto it (server dry runs in both directions, so switching is instant and
 * each card shows what it holds), confirm. Online-only: the merge rewrites both people at once
 * and never queues.
 */
import { onlineManager } from "@tanstack/react-query";
import { AtSign, Bell, Check, FileText, Handshake, ListChecks, MessageCircle, Shapes, Tag, Users } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Avatar } from "@/components/glass/Avatar";
import { GlassButton } from "@/components/glass/GlassButton";
import { confirm } from "@/components/ui/confirm";
import { Field } from "@/components/ui/Field";
import { InsetGroup } from "@/components/ui/InsetGroup";
import { ListRow } from "@/components/ui/ListRow";
import { Sheet } from "@/components/ui/Sheet";
import { Skeleton, SkeletonRows } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import { formatDate } from "@/lib/format";
import { useIsPhone } from "@/lib/media";
import { useMergePreview, usePeopleIndex, usePersonWrites, type MergeReport } from "@/lib/queries/people";
import type { PersonDetailApi } from "@/lib/queries/types";
import { cn } from "@/lib/utils";
import { cardCounts, filledFields, listJoin, movedRows, movedSummary, nameKey, type MovedKind } from "./duplicates";
import { PersonPicker, type PersonPick } from "./PersonPicker";

/** A person as the sheet shows them; `createdAt` keeps "Added …" on screen after the merge drops them from the index. */
export type MergeCard = PersonPick & { createdAt?: Date | string | null };

export type MergePersonSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The card the sheet was opened from — kept by default. */
  person: MergeCard;
  /** The other card, already known (a duplicate suggestion). */
  other?: MergeCard | null;
  /** Opened from a suggestion: offers "Not the same person". */
  onNotDuplicate?: () => void;
  /** After a successful merge; the sheet has closed and toasted. */
  onMerged?: (kept: PersonDetailApi, report: MergeReport) => void;
};

const MOVED_ICON: Record<MovedKind, ReactNode> = {
  notes: <FileText />,
  reminders: <Bell />,
  mentions: <AtSign />,
  introduced: <Handshake />,
  chat_threads: <MessageCircle />,
  person_categories: <Shapes />,
  person_tags: <Tag />,
  person_activities: <Users />,
};

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en")} ${n === 1 ? one : many}`;

export function MergePersonSheet({ open, onOpenChange, person, other: suggested, onNotDuplicate, onMerged }: MergePersonSheetProps) {
  const writes = usePersonWrites();
  const isPhone = useIsPhone();
  const { data: index } = usePeopleIndex();
  const [other, setOther] = useState<MergeCard | null>(suggested ?? null);
  const [keepId, setKeepId] = useState(person.id);
  const [busy, setBusy] = useState(false);

  // Fresh state every time the sheet opens (adjusted during render).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setOther(suggested ?? null);
      setKeepId(person.id);
    }
  }

  const keep = other && keepId === other.id ? other : person;
  const drop = other ? (keep.id === person.id ? other : person) : null;

  // Each direction's dry run is also "what the card going away holds".
  const otherIntoPerson = useMergePreview(other?.id ?? "", open && other ? person.id : null);
  const personIntoOther = useMergePreview(person.id, open && other ? other.id : null);
  const preview = keep.id === person.id ? otherIntoPerson : personIntoOther;
  const report = preview.data;

  const rowById = useMemo(() => new Map((index ?? []).map((r) => [r.id, r])), [index]);
  const sameName = useMemo(() => {
    const key = nameKey(person.displayName);
    return key ? (index ?? []).filter((r) => r.id !== person.id && nameKey(r.displayName) === key) : [];
  }, [index, person.id, person.displayName]);

  const sameNames = !!drop && nameKey(drop.displayName) === nameKey(keep.displayName);
  const fills = report ? filledFields(report.fields) : [];
  const moves = report ? movedRows(report.moved) : [];

  const merge = async () => {
    if (!drop || !report) return;
    if (!onlineManager.isOnline()) {
      toast.error("You’re offline", { description: "Merging needs a connection." });
      return;
    }
    const ok = await confirm({
      title: sameNames ? `Merge the two ${keep.displayName} cards?` : `Merge ${drop.displayName} into ${keep.displayName}?`,
      message: "Everything moves onto the card you keep and the other card is removed. This can’t be undone.",
      confirmLabel: "Merge",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const { person: kept, report: done } = await writes.merge(drop.id, keep.id);
      onOpenChange(false);
      toast.success(`Merged into ${kept.displayName}`, { description: movedSummary(done.moved) || undefined, duration: 6000 });
      onMerged?.(kept, done);
    } catch {
      // The mutation default already said why (offline, gone, server error).
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={other ? "Merge cards" : "Merge with…"}
      description={other ? "Choose the card to keep. Everything else moves onto it." : `Find the other card for ${person.displayName}.`}
      cancel
      headerRight={<span />}
      width={520}
      dismissible={!busy}
      footer={
        other ? (
          <div className="flex items-center gap-2">
            {onNotDuplicate && (
              <GlassButton
                variant="ghost"
                onClick={() => {
                  onNotDuplicate();
                  onOpenChange(false);
                }}
                disabled={busy}
              >
                Not the same person
              </GlassButton>
            )}
            <GlassButton variant="primary" className="ml-auto max-sm:flex-1" loading={busy} disabled={!report} onClick={() => void merge()}>
              {sameNames ? "Merge cards" : `Merge into ${firstName(keep.displayName)}`}
            </GlassButton>
          </div>
        ) : undefined
      }
    >
      {!other ? (
        <div className="space-y-6 pt-1">
          <Field label="Other card">
            <PersonPicker value={null} onChange={(p) => p && setOther(p)} exclude={[person.id]} autoFocus={!isPhone} placeholder="Search people" aria-label="Other card" />
          </Field>
          {sameName.length > 0 && (
            <InsetGroup header="Same name">
              {sameName.map((p) => (
                <ListRow
                  key={p.id}
                  leading={<Avatar name={p.displayName} src={p.avatarUrl} size={36} />}
                  label={p.displayName}
                  description={[p.headline, p.company].filter(Boolean).join(" · ") || `Added ${formatDate(p.createdAt)}`}
                  onClick={() => setOther(p)}
                  chevron
                />
              ))}
            </InsetGroup>
          )}
        </div>
      ) : (
        <div className="space-y-6 pt-2">
          <div className="space-y-2">
            <div role="radiogroup" aria-label="Card to keep" className="grid grid-cols-2 gap-2.5">
              {[person, other].map((p) => (
                <KeepCard
                  key={p.id}
                  person={p}
                  addedAt={p.createdAt ?? rowById.get(p.id)?.createdAt ?? null}
                  counts={cardCounts((p.id === person.id ? personIntoOther : otherIntoPerson).data)}
                  selected={keep.id === p.id}
                  disabled={busy}
                  onSelect={() => setKeepId(p.id)}
                />
              ))}
            </div>
            {!suggested && (
              <button
                type="button"
                onClick={() => setOther(null)}
                disabled={busy}
                className="pressable hit-44 relative ml-2 rounded-full px-2 text-footnote font-medium text-accent-text hover:bg-accent-soft disabled:opacity-40"
              >
                Pick a different card
              </button>
            )}
          </div>

          <InsetGroup
            header={`Moves to ${sameNames ? "the kept card" : firstName(keep.displayName)}`}
            footer={
              report && drop
                ? fills.length
                  ? `Adds ${listJoin(fills)} from the other card. Nothing already on the kept card is overwritten.`
                  : "Details already on the kept card stay as they are."
                : undefined
            }
          >
            {preview.isPending ? (
              <SkeletonRows count={2} avatar={false} />
            ) : preview.isError ? (
              <ListRow label="Couldn’t preview the merge" description={preview.error.message} />
            ) : moves.length || report?.factsMerged ? (
              <>
                {moves.map((m) => (
                  <ListRow key={m.kind} icon={MOVED_ICON[m.kind]} label={m.label} value={m.count.toLocaleString("en")} />
                ))}
                {report?.factsMerged && <ListRow icon={<ListChecks />} label="Key facts" value="Combined into one" />}
              </>
            ) : (
              <ListRow label="Nothing to move" description="The other card only goes away." />
            )}
          </InsetGroup>
        </div>
      )}
    </Sheet>
  );
}

function KeepCard({
  person,
  addedAt,
  counts,
  selected,
  disabled,
  onSelect,
}: {
  person: MergeCard;
  addedAt: Date | string | null;
  counts: { notes: number; followUps: number } | null;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  const role = [person.headline, person.company].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        "pressable surface relative flex min-w-0 flex-col items-center rounded-lg px-3 pt-5 pb-3 text-center outline-offset-2 transition-[box-shadow,opacity] duration-150",
        selected ? "ring-2 ring-accent" : "opacity-75 hover:opacity-100",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-2.5 right-2.5 grid size-[22px] place-items-center rounded-full transition-colors duration-150",
          selected ? "bg-accent-fill text-accent-fg" : "ring-[1.5px] ring-fg-4 ring-inset",
        )}
      >
        {selected && <Check size={14} strokeWidth={3} />}
      </span>
      <Avatar name={person.displayName} src={person.avatarUrl} size={52} />
      <span className="mt-2 w-full truncate text-headline text-fg">{person.displayName}</span>
      <span className="w-full truncate text-footnote text-fg-3">{role || " "}</span>
      <span className="mt-2 w-full truncate text-caption text-fg-2 tabular-nums">
        {counts ? (
          `${plural(counts.notes, "note", "notes")} · ${plural(counts.followUps, "follow-up", "follow-ups")}`
        ) : (
          <Skeleton className="mx-auto h-3 w-24 rounded-full" />
        )}
      </span>
      {addedAt && <span className="mt-0.5 w-full truncate text-caption text-fg-3">Added {formatDate(addedAt)}</span>}
      <span className={cn("mt-2.5 rounded-full px-2.5 py-0.5 text-caption font-semibold", selected ? "bg-accent-soft text-accent-text" : "bg-fill-1 text-fg-3")}>
        {selected ? "Keep" : "Merge in"}
      </span>
    </button>
  );
}
