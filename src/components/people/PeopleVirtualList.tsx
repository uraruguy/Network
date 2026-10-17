"use client";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { BellPlus, Copy, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type Ref } from "react";
import { ContextMenu } from "@/components/ui/ContextMenu";
import type { MenuItem } from "@/components/ui/Menu";
import { toast } from "@/components/ui/Toast";
import type { PeopleRow } from "@/lib/filters/people-filters";
import { cn } from "@/lib/utils";
import { PERSON_ROW_HEIGHT, PersonRow } from "./PersonRow";

export type PeopleVirtualListHandle = { scrollToIndex: (index: number) => void };

export type PeopleVirtualListProps = {
  people: readonly PeopleRow[];
  emojiById: ReadonlyMap<string, string>;
  detail?: "last" | "followup";
  /** Opens the follow-up sheet for a person (context menu "Follow up…"). */
  onFollowUp?: (person: PeopleRow) => void;
  /** Dims the list while newer filters are rendering. */
  stale?: boolean;
  /** Imperative scroll (A–Z index). */
  handleRef?: Ref<PeopleVirtualListHandle>;
  className?: string;
};

/**
 * The people list as one grouped inset surface, virtualized against the window scroll (the app
 * shell scrolls the document): fixed 68px rows, only what's on screen (+8 each side) is mounted.
 * One shared context menu serves every row (right-click / long-press): Open, Follow up…, Copy name.
 */
export function PeopleVirtualList({ people, emojiById, detail, onFollowUp, stale, handleRef, className }: PeopleVirtualListProps) {
  "use no memo";
  const router = useRouter();
  const listRef = useRef<HTMLUListElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  // The list's document offset (header + filter bar above it). Re-measured when anything above resizes.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = () => setScrollMargin(Math.round(el.getBoundingClientRect().top + window.scrollY));
    measure();
    const ro = new ResizeObserver(measure);
    for (let n: Element | null = el.parentElement; n && n !== document.body; n = n.parentElement) {
      for (const sib of Array.from(n.children)) if (sib !== el && !sib.contains(el)) ro.observe(sib);
      if (n.tagName === "MAIN") break;
    }
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const virtualizer = useWindowVirtualizer({
    count: people.length,
    estimateSize: () => PERSON_ROW_HEIGHT,
    overscan: 8,
    scrollMargin,
    getItemKey: (i) => people[i]!.id,
  });

  // Imperative handle for the A–Z scrubber.
  // Lands the row just below the sticky filter bar (rows are fixed-height, so the offset is exact).
  useImperativeHandle(
    handleRef,
    () => ({
      scrollToIndex: (index) => {
        const bar = document.querySelector<HTMLElement>("[data-filter-bar]");
        const inset = bar ? bar.offsetHeight + (parseFloat(getComputedStyle(bar).top) || 0) : 0;
        window.scrollTo({ top: Math.max(0, scrollMargin + index * PERSON_ROW_HEIGHT - inset) });
      },
    }),
    [scrollMargin],
  );

  // Context menu target: the row under the pointer when the menu opens.
  const [target, setTarget] = useState<PeopleRow | null>(null);
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const pickTarget = (e: React.SyntheticEvent) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>("[data-person-id]")?.dataset.personId;
    setTarget((id && byId.get(id)) || null);
  };

  const items: MenuItem[] = target
    ? [
        { label: "Open", icon: <UserRound />, onSelect: () => router.push(`/people/${target.id}`, { transitionTypes: ["nav-forward"] }) },
        ...(onFollowUp ? [{ label: "Follow up…", icon: <BellPlus />, onSelect: () => onFollowUp(target) }] : []),
        "separator",
        {
          label: "Copy name",
          icon: <Copy />,
          onSelect: () => {
            navigator.clipboard?.writeText(target.displayName).then(
              () => toast({ title: "Name copied", description: target.displayName }),
              () => toast({ title: "Couldn't copy", type: "error" }),
            );
          },
        },
      ]
    : [];

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <ContextMenu items={items} title={target?.displayName} className={cn("block", className)}>
      <ul
        ref={listRef}
        aria-label="People"
        onPointerDownCapture={pickTarget}
        onContextMenuCapture={pickTarget}
        className={cn(
          "surface relative overflow-hidden rounded-lg transition-opacity duration-200",
          stale && "opacity-70 delay-150",
        )}
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualItems.map((item) => {
          const p = people[item.index]!;
          const last = item.index === people.length - 1;
          return (
            <li
              key={item.key}
              data-index={item.index}
              data-last={last ? "" : undefined}
              aria-posinset={item.index + 1}
              aria-setsize={people.length}
              className="group/item absolute inset-x-0 top-0"
              style={{ height: PERSON_ROW_HEIGHT, transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)` }}
            >
              <PersonRow p={p} emojiById={emojiById} detail={detail} />
            </li>
          );
        })}
      </ul>
    </ContextMenu>
  );
}
