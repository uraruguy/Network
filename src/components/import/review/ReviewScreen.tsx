"use client";
import { ArrowUp, Check, ChevronLeft, Footprints, Keyboard, Merge, MoreHorizontal, Pencil, PartyPopper, Scissors, Undo2, UserX } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Avatar } from "@/components/glass/Avatar";
import { GlassButton } from "@/components/glass/GlassButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { Menu } from "@/components/ui/Menu";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Skeleton, SkeletonRows, SkeletonText } from "@/components/ui/Skeleton";
import { Tooltip, TooltipProvider } from "@/components/ui/Tooltip";
import { CATEGORY_SLUGS } from "@/lib/import/contracts";
import { useIsPhone } from "@/lib/media";
import { useMotionSafe } from "@/lib/motion";
import { useCacheReady } from "@/lib/offline/useCacheReady";
import type { MergeTarget, Proposal } from "@/lib/queries/import-review";
import { cn } from "@/lib/utils";
import { BatchCards } from "./BatchCards";
import { CardStack } from "./CardStack";
import { CommitPanel } from "./CommitPanel";
import { EditSheet, MergeDialog, SHORTCUTS, ShortcutLegend, SplitDialog, type EditPatch } from "./dialogs";
import { Kbd, ProgressBar, SectionLabel } from "./parts";
import { ProposalCard, type SimilarEntry } from "./ProposalCard";
import { ProposalList } from "./ProposalList";
import { classifyTarget, decisionOf, formatTimeLeft, keyToCommand, type Command } from "./state";
import { avatarName, plural, sourceLabel } from "./text";
import { useReviewSession } from "./useReviewSession";

export type ReviewTabKey = "review" | "approved" | "rejected" | "commit";
const TABS: ReviewTabKey[] = ["review", "approved", "rejected", "commit"];
type DialogKind = "merge" | "split" | "edit" | "legend" | null;

/** /import/[source]: confirm the unsure people one at a time, audit the rest, then commit. */
export function ReviewScreen({ source }: { source: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get("tab");
  const tab: ReviewTabKey = TABS.includes(raw as ReviewTabKey) ? (raw as ReviewTabKey) : "review";
  const setTab = useCallback((t: ReviewTabKey) => router.replace(t === "review" ? pathname : `${pathname}?tab=${t}`, { scroll: false }), [router, pathname]);
  const isPhone = useIsPhone();

  const s = useReviewSession(source);
  // Cached counts and lists only once they may render (see useCacheReady): the server HTML and
  // the hydration render then agree.
  const cacheReady = useCacheReady();
  const counts = cacheReady ? s.status.data?.proposals : undefined;
  const reviewCount = s.loading ? (counts?.proposed ?? 0) : s.progress.remaining;

  return (
    <TooltipProvider>
      <header className="mb-4 flex items-center gap-2">
        <Link
          href="/import"
          className="pressable -ml-2 inline-flex h-11 items-center gap-0.5 rounded-full pr-3 pl-1.5 text-body text-accent-text hover:bg-accent-soft"
        >
          <ChevronLeft size={22} strokeWidth={2.4} aria-hidden />
          Import
        </Link>
        <div className="ml-auto flex items-center gap-1">
          {tab === "review" && (
            <>
              <Tooltip content="Undo" shortcut="⌘Z">
                <IconButton label="Undo" variant="plain" icon={<Undo2 />} onClick={s.undoLast} disabled={!s.state.log.length} />
              </Tooltip>
              {!isPhone && <LegendButton />}
            </>
          )}
        </div>
      </header>
      <h1 className="text-title1 sm:text-large-title">{sourceLabel(source)}</h1>
      <p className="mt-1 mb-4 text-subhead text-fg-2">Confirm the people Claude wasn’t sure about. Everything else is ready to go.</p>

      <SegmentedControl<ReviewTabKey>
        aria-label="Review sections"
        fullWidth
        size="lg"
        value={tab}
        onChange={setTab}
        className="mb-4"
        items={[
          { value: "review", label: isPhone ? <PhoneTab count={reviewCount} label="Review" /> : `To review · ${reviewCount}`, ariaLabel: `To review, ${reviewCount}` },
          { value: "approved", label: isPhone ? <PhoneTab count={counts?.autoApproved ?? 0} label="By Claude" /> : `Auto-approved · ${counts?.autoApproved ?? 0}`, ariaLabel: `Auto-approved, ${counts?.autoApproved ?? 0}` },
          { value: "rejected", label: isPhone ? <PhoneTab count={counts?.rejected ?? 0} label="Skipped" /> : `Passers-by · ${counts?.rejected ?? 0}`, ariaLabel: `Passers-by, ${counts?.rejected ?? 0}` },
          { value: "commit", label: isPhone ? <PhoneTab label="Commit" /> : "Commit" },
        ]}
      />

      {tab === "review" && <ReviewTab session={s} source={source} onCommit={() => setTab("commit")} />}
      {tab !== "review" && !cacheReady && <SkeletonRows count={6} className="surface overflow-hidden rounded-lg" />}
      {cacheReady && tab === "approved" && <ProposalList source={source} tab="approved" />}
      {cacheReady && tab === "rejected" && <ProposalList source={source} tab="rejected" />}
      {cacheReady && tab === "commit" && <CommitPanel source={source} onReview={() => setTab("review")} />}
    </TooltipProvider>
  );
}

/** Compact two-line segment for phones: the count over a short word. */
function PhoneTab({ count, label }: { count?: number; label: string }) {
  return (
    <span className="flex flex-col items-center leading-none">
      {count !== undefined && <span className="text-subhead font-semibold tabular-nums">{count}</span>}
      <span className={cn(count !== undefined ? "mt-0.5 text-caption2" : "text-footnote")}>{label}</span>
    </span>
  );
}

function LegendButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Tooltip content="Keyboard shortcuts" shortcut="?">
        <IconButton label="Keyboard shortcuts" variant="plain" icon={<Keyboard />} onClick={() => setOpen(true)} />
      </Tooltip>
      <ShortcutLegend open={open} onOpenChange={setOpen} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Review tab                                                         */
/* ------------------------------------------------------------------ */

function ReviewTab({ session: s, source, onCommit }: { session: ReturnType<typeof useReviewSession>; source: string; onCommit: () => void }) {
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [renameSignal, setRenameSignal] = useState(0);
  const isPhone = useIsPhone();
  const p = s.current;
  const verdict = s.currentVerdict;
  const { state, progress } = s;

  const upNext = useMemo(() => {
    const out: Proposal[] = [];
    for (let i = state.index + 1; i < state.queue.length && out.length < 6; i++) {
      const id = state.queue[i]!;
      if (!decisionOf(state, id) && s.items[id]) out.push(s.items[id]!);
    }
    return out;
  }, [state, s.items]);

  const approve = useCallback(
    (x: Proposal) => s.verdict(x.id, "approve", { id: x.id, action: "approve" }, x.matchPerson ? `Added ${x.displayName} to ${x.matchPerson.displayName}` : `Approved ${x.displayName}`),
    [s],
  );
  const reject = useCallback((x: Proposal) => s.verdict(x.id, "reject", { id: x.id, action: "reject" }, `${x.displayName} — not a person`), [s]);
  const passerby = useCallback((x: Proposal) => s.verdict(x.id, "passerby", { id: x.id, action: "passerby" }, `${x.displayName} is a passer-by`), [s]);
  const mergeInto = useCallback(
    (x: Proposal, t: Pick<MergeTarget, "kind" | "id" | "displayName">) => {
      setDialog(null);
      if (t.kind === "person") s.verdict(x.id, "merge", { id: x.id, action: "approve", matchPersonId: t.id }, `Added ${x.displayName} to ${t.displayName}`);
      else s.verdict(x.id, "merge", { id: x.id, action: "merge", intoId: t.id }, `Merged ${x.displayName} into ${t.displayName}`);
    },
    [s],
  );
  const toggleCategory = useCallback(
    (x: Proposal, slug: (typeof CATEGORY_SLUGS)[number]) => {
      const cur = x.profile.categories;
      s.edit(x.id, { profile: { categories: cur.includes(slug) ? cur.filter((c) => c !== slug) : [...cur, slug] } }, { debounce: true });
    },
    [s],
  );

  const handle = useCallback(
    (cmd: Command) => {
      if (cmd.type === "legend") return setDialog("legend");
      if (cmd.type === "undo") return s.undoLast();
      if (cmd.type === "back") return s.dispatch({ type: "back", now: Date.now() });
      if (cmd.type === "later") return s.dispatch({ type: "later", now: Date.now() });
      if (!p) return;
      switch (cmd.type) {
        case "approve":
          return approve(p);
        case "reject":
          return reject(p);
        case "passerby":
          return passerby(p);
        case "merge":
          return setDialog("merge");
        case "split":
          return setDialog("split");
        case "edit":
          return verdict ? undefined : setDialog("edit");
        case "rename":
          return verdict ? undefined : setRenameSignal((n) => n + 1);
        case "followup":
          if (!verdict && p.profile.followUps.length) s.edit(p.id, { createReminder: !p.createReminder }, { debounce: true });
          return;
        case "category": {
          const slug = CATEGORY_SLUGS[cmd.index];
          if (slug && !verdict) toggleCategory(p, slug);
          return;
        }
      }
    },
    [p, verdict, s, approve, reject, passerby, toggleCategory],
  );

  // Global shortcuts (ignored while typing, in menus and in dialogs).
  const handler = useRef(handle);
  useEffect(() => {
    handler.current = handle;
  }, [handle]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const t = e.target instanceof HTMLElement ? e.target : null;
      if (t?.closest('[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"]')) return;
      const cmd = keyToCommand(e, classifyTarget(t), dialog !== null);
      if (!cmd) return;
      e.preventDefault();
      handler.current(cmd);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog]);

  // A new card starts at its top (after deciding from the bottom of a long card).
  const top = useRef<HTMLDivElement>(null);
  const motionSafe = useMotionSafe();
  const cardId = p?.id;
  useEffect(() => {
    const el = top.current;
    if (!el || !cardId) return;
    const y = el.getBoundingClientRect().top + window.scrollY - 16;
    if (window.scrollY > y + 8) window.scrollTo({ top: Math.max(0, y), behavior: motionSafe ? "smooth" : "auto" });
  }, [cardId, motionSafe]);

  const pct = progress.total ? progress.decided / progress.total : 0;
  const timeLeft = formatTimeLeft(progress.secondsLeft);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_248px]">
      <div ref={top} className="mx-auto w-full max-w-[640px] min-w-0 scroll-mt-4">
        {progress.total > 0 && (
          <div className="mb-4 space-y-1.5" aria-live="polite">
            <p className="flex items-baseline justify-between gap-3 text-footnote text-fg-2 tabular-nums">
              <span>
                <span className="font-semibold text-fg">{progress.decided}</span> / {progress.total}
                {timeLeft && <span className="text-fg-3"> · {timeLeft}</span>}
              </span>
              {s.pending > 0 && <span className="text-fg-3">Saving…</span>}
            </p>
            <ProgressBar value={pct} label="Review progress" />
          </div>
        )}

        <CardStack
          cardKey={p?.id ?? null}
          motion={state.motion}
          nextName={upNext[0]?.displayName ?? null}
          swipeable={!!p}
          onSwipe={(o) => {
            if (!p) return;
            if (o === "approve") approve(p);
            else if (o === "reject") reject(p);
            else s.dispatch({ type: "later", now: Date.now() });
          }}
          empty={s.loading ? <CardSkeleton /> : <DoneState source={source} decided={progress.decided} onCommit={onCommit} error={s.error} />}
        >
          {p && (
            <ProposalCard
              proposal={p}
              verdict={verdict}
              verdictLabel={verdict ? s.labels[p.id] : null}
              onUndo={verdict ? () => s.undoOne(p.id) : undefined}
              onRename={(name) => s.edit(p.id, { displayName: name })}
              onToggleCategory={(slug) => toggleCategory(p, slug)}
              onToggleReminder={(on) => s.edit(p.id, { createReminder: on }, { debounce: true })}
              onQuickMerge={(t: SimilarEntry) => mergeInto(p, t)}
              renameSignal={renameSignal}
              showKeys={!isPhone}
            />
          )}
        </CardStack>

        {p && (
          <ActionBar
            onBack={() => s.dispatch({ type: "back", now: Date.now() })}
            canBack={state.index > 0}
            onReject={() => reject(p)}
            onPasserby={() => passerby(p)}
            onLater={() => s.dispatch({ type: "later", now: Date.now() })}
            onApprove={() => approve(p)}
            onMerge={() => setDialog("merge")}
            onSplit={() => setDialog("split")}
            onEdit={() => setDialog("edit")}
            onRename={() => setRenameSignal((n) => n + 1)}
            decided={!!verdict}
          />
        )}
      </div>

      <aside className="hidden space-y-6 xl:block" aria-label="Up next">
        {upNext.length > 0 && (
          <section className="space-y-2">
            <SectionLabel>Up next</SectionLabel>
            <ul className="space-y-0.5">
              {upNext.map((x) => (
                <li key={x.id}>
                  <button
                    type="button"
                    onClick={() => s.dispatch({ type: "jump", id: x.id, now: Date.now() })}
                    className="pressable flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left hover:bg-fill-1"
                  >
                    <Avatar name={avatarName(x.displayName)} size={28} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-subhead text-fg">{x.displayName}</span>
                      <span className="block truncate text-caption text-fg-3">{plural(x.mentionCount, "note")}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="space-y-2">
          <SectionLabel action={<button type="button" onClick={() => setDialog("legend")} className="text-footnote text-accent-text hover:underline">All</button>}>Shortcuts</SectionLabel>
          <ul className="space-y-1.5">
            {SHORTCUTS.slice(0, 6).concat(SHORTCUTS.filter((x) => x.label === "Later" || x.label === "Undo")).map((x) => (
              <li key={x.label} className="flex items-center justify-between gap-2 text-footnote text-fg-2">
                <span>{x.label}</span>
                <span className="flex gap-1">
                  {x.keys.slice(0, 1).map((k) => (
                    <Kbd key={k}>{k}</Kbd>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </aside>

      <MergeDialog open={dialog === "merge"} onOpenChange={(o) => setDialog(o ? "merge" : null)} source={source} proposal={p} onPick={(t) => p && mergeInto(p, t)} />
      <SplitDialog
        open={dialog === "split"}
        onOpenChange={(o) => setDialog(o ? "split" : null)}
        proposal={p}
        onSplit={async (mentionIds, displayName) => {
          if (!p) return;
          await s.act(p.id, { id: p.id, action: "split", mentionIds, displayName }, `Split ${displayName} off ${p.displayName}`);
          setDialog(null);
        }}
      />
      <EditSheet
        open={dialog === "edit"}
        onOpenChange={(o) => setDialog(o ? "edit" : null)}
        proposal={p}
        onSave={async (patch: EditPatch) => {
          if (!p) return;
          await s.act(p.id, { id: p.id, action: "edit", ...patch }, `Saved changes to ${patch.displayName}`);
        }}
      />
      <ShortcutLegend open={dialog === "legend"} onOpenChange={(o) => setDialog(o ? "legend" : null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Action bar                                                         */
/* ------------------------------------------------------------------ */

function ActionBar(props: {
  onBack: () => void;
  canBack: boolean;
  onReject: () => void;
  onPasserby: () => void;
  onLater: () => void;
  onApprove: () => void;
  onMerge: () => void;
  onSplit: () => void;
  onEdit: () => void;
  onRename: () => void;
  decided: boolean;
}) {
  return (
    <div className="sticky bottom-[calc(72px+max(10px,var(--sab)))] z-10 mt-4 lg:bottom-6">
      <div role="toolbar" aria-label="Decide" className="glass specular mx-auto flex items-center justify-between gap-1 rounded-xl p-1.5 sm:gap-2 sm:p-2">
        <Action label="Back" kbd="K" icon={<ChevronLeft />} onClick={props.onBack} disabled={!props.canBack} compact />
        <Action label="Not a person" kbd="X" icon={<UserX />} onClick={props.onReject} tone="danger" />
        <Action label="Passer-by" kbd="P" icon={<Footprints />} onClick={props.onPasserby} />
        <Menu
          title="More"
          side="top"
          align="center"
          trigger={<Action label="More" icon={<MoreHorizontal />} />}
          items={[
            { label: "Merge into…", icon: <Merge />, onSelect: props.onMerge, shortcut: "M" },
            { label: "Split…", icon: <Scissors />, onSelect: props.onSplit, shortcut: "S" },
            { label: "Edit…", icon: <Pencil />, onSelect: props.onEdit, shortcut: "E", disabled: props.decided },
            { label: "Rename", icon: <Pencil />, onSelect: props.onRename, shortcut: "R", disabled: props.decided },
          ]}
        />
        <Action label="Later" kbd="J" icon={<ArrowUp />} onClick={props.onLater} />
        <Action label="Approve" kbd="A" icon={<Check />} onClick={props.onApprove} tone="primary" />
      </div>
    </div>
  );
}

type ActionProps = { label: string; kbd?: string; icon: ReactNode; tone?: "primary" | "danger"; compact?: boolean } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">;

/** Toolbar button: icon over caption on phones, icon + label + key hint from `sm`. */
function Action({ label, kbd, icon, tone, compact, className, ...rest }: ActionProps) {
  return (
    <button
      type="button"
      {...rest}
      aria-label={label}
      aria-keyshortcuts={kbd}
      title={kbd ? `${label} (${kbd})` : label}
      className={cn(
        "pressable flex min-h-12 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-caption2 font-semibold select-none disabled:opacity-35 sm:min-h-11 sm:flex-row sm:gap-2 sm:px-3 sm:text-subhead [&_svg]:size-5 sm:[&_svg]:size-[18px]",
        tone === "primary" ? "bg-accent-fill text-accent-fg specular elevation-e1 hover:brightness-[1.05]" : tone === "danger" ? "text-danger hover:bg-danger-soft" : "text-fg-2 hover:bg-fill-1 hover:text-fg",
        compact && "max-w-11 flex-none sm:px-2.5",
        className,
      )}
    >
      {icon}
      <span className={cn("text-center leading-[1.1] sm:whitespace-nowrap", compact && "sr-only")}>{label}</span>
      {kbd && <Kbd className={cn("hidden xl:inline-grid", tone === "primary" && "border-white/30 bg-white/15 text-accent-fg")}>{kbd}</Kbd>}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Empty / done                                                       */
/* ------------------------------------------------------------------ */

function CardSkeleton() {
  return (
    <div className="surface space-y-4 rounded-xl p-4 sm:p-6">
      <div className="flex items-center gap-3.5">
        <Skeleton className="size-14 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-1/2 rounded-full" />
          <Skeleton className="h-3.5 w-1/3 rounded-full" />
        </div>
      </div>
      <SkeletonText lines={4} />
    </div>
  );
}

function DoneState({ source, decided, onCommit, error }: { source: string; decided: number; onCommit: () => void; error: unknown }) {
  if (error)
    return <EmptyState title="Couldn’t load the review" description={error instanceof Error ? error.message : "Try again in a moment."} />;
  return (
    <div className="space-y-4">
      <div className="surface rounded-xl">
        <EmptyState
          icon={<PartyPopper />}
          title={decided ? "All caught up" : "Nobody to review"}
          description={decided ? `You decided ${plural(decided, "person", "people")}. Take a look at the batch items below, then commit.` : "Claude was sure about everyone. Check the batch items below, then commit."}
          action={
            <GlassButton variant="primary" onClick={onCommit}>
              Review the commit
            </GlassButton>
          }
        />
      </div>
      <BatchCards source={source} />
    </div>
  );
}
