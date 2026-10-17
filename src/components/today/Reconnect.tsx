"use client";
import Link from "next/link";
import { useMemo } from "react";
import { Avatar } from "@/components/glass/Avatar";
import { Bar } from "@/components/skeletons/parts";
import { NAV_FORWARD } from "@/components/shell/transitions";
import { useNow } from "@/lib/clock";
import { useQueryReady } from "@/lib/offline/useCacheReady";
import { usePeopleIndex } from "@/lib/queries/people";
import { WARMTH_META } from "@/lib/utils";
import { Section } from "./Section";
import { reconnectCandidates, silenceLabel } from "./today-data";

/**
 * Nudges: inner-circle and active people with no logged interaction for 60+ days, from the
 * cached people index (instant, offline). Hidden when there's nobody to nudge.
 */
export function Reconnect({ className }: { className?: string }) {
  const now = useNow();
  const index = usePeopleIndex();
  const ready = useQueryReady(index);
  const data = ready ? index.data : undefined;
  const people = useMemo(() => (data ? reconnectCandidates(data, now, 12) : []), [data, now]);
  const loading = !ready;
  if (!loading && people.length === 0) return null;

  return (
    <Section
      id="reconnect"
      title="Reconnect"
      caption="Close people you haven't been in touch with for two months"
      action={
        <Link href="/people?w=inner,active" className="font-medium text-accent-text">
          See all
        </Link>
      }
      className={className}
    >
      <div className="no-scrollbar -mx-[var(--page-px)] flex snap-x snap-mandatory scroll-px-[var(--page-px)] gap-2 overflow-x-auto px-[var(--page-px)] pt-0.5 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {loading ? <ReconnectSkeleton /> : people.map((p) => <Nudge key={p.id} person={p} now={now} />)}
      </div>
    </Section>
  );
}

function Nudge({ person: p, now }: { person: { id: string; displayName: string; avatarUrl: string | null; warmth: keyof typeof WARMTH_META; lastInteractionAt: string | Date | null }; now: number }) {
  const silence = silenceLabel(p.lastInteractionAt, now);
  return (
    <Link
      href={`/people/${p.id}`}
      transitionTypes={NAV_FORWARD}
      className="surface pressable flex h-14 max-w-[15rem] shrink-0 snap-start items-center gap-2.5 rounded-full pr-4 pl-2 outline-none focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] [@media(hover:hover)]:hover:bg-surface-2"
    >
      <span className="relative shrink-0">
        <Avatar name={p.displayName} src={p.avatarUrl} size={40} />
        <span
          aria-hidden
          className="absolute -right-px -bottom-px size-3 rounded-full ring-2 ring-[var(--surface-solid)]"
          style={{ background: WARMTH_META[p.warmth].color }}
        />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-subhead font-semibold text-fg">{p.displayName}</span>
        <span className="block truncate text-caption text-fg-3">
          {silence ? `${silence} ago` : "Nothing logged yet"} · {WARMTH_META[p.warmth].label}
        </span>
      </span>
    </Link>
  );
}

export function ReconnectSkeleton() {
  return (
    <div className="ui-skeleton-reveal contents" role="status" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <div key={i} className="surface flex h-14 w-48 shrink-0 items-center gap-2.5 rounded-full pr-4 pl-2">
          <Bar className="size-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Bar className="h-3 w-24" />
            <Bar className="h-2.5 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}
