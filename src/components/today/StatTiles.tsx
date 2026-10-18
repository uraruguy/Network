"use client";
import Link from "next/link";
import { Bell, Globe2, Users, type LucideIcon } from "lucide-react";
import { Bar, InlineBar } from "@/components/skeletons/parts";
import { TAB } from "@/components/shell/transitions";
import { useQueryReady } from "@/lib/offline/useCacheReady";
import { useStats } from "@/lib/queries/misc";
import { cn } from "@/lib/utils";

const nf = new Intl.NumberFormat("en-GB");

/** Headline numbers from /api/stats (one tiny query — never the full people list). */
export function StatTiles() {
  const stats = useStats();
  const loading = !useQueryReady(stats);
  // Nothing data-derived until ready, or hydration would disagree with the server HTML.
  const data = loading ? undefined : stats.data;
  const due = data ? data.overdue + data.dueToday : 0;
  return (
    <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
      <Tile href="/people" icon={Users} label="People" value={data?.people} loading={loading} />
      <Tile href="/globe" icon={Globe2} label="Cities" value={data?.cities} loading={loading} />
      <Tile
        href="#due"
        icon={Bell}
        label={data?.overdue ? `${data.overdue} overdue` : "Due today"}
        value={due}
        accent={due > 0}
        loading={loading}
      />
    </div>
  );
}

export function StatTilesSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="surface flex h-[92px] flex-col justify-between rounded-lg p-3.5">
          <Bar className="size-7 rounded-full" />
          <div className="space-y-1.5">
            <Bar className="h-5 w-12" />
            <Bar className="h-2.5 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Tile({ href, icon: Icon, label, value, accent, loading }: { href: string; icon: LucideIcon; label: string; value?: number; accent?: boolean; loading: boolean }) {
  const body = (
    <>
      <span
        className={cn(
          "grid size-7 place-items-center rounded-full transition-colors duration-300",
          accent ? "bg-accent-fill text-accent-fg" : "bg-accent-soft text-accent-text",
        )}
        aria-hidden
      >
        <Icon size={15} strokeWidth={2.2} />
      </span>
      <span className="min-w-0">
        <span className={cn("block h-7 text-title2 tabular-nums", accent ? "text-accent-text" : "text-fg")}>
          {loading ? <InlineBar className="ui-skeleton-reveal h-5 w-12" /> : nf.format(value ?? 0)}
        </span>
        <span className="block truncate text-caption text-fg-3">{label}</span>
      </span>
    </>
  );
  const className =
    "surface pressable flex h-[92px] flex-col justify-between rounded-lg p-3.5 outline-none focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] [@media(hover:hover)]:hover:bg-surface-2";
  if (href.startsWith("#"))
    return (
      <a href={href} className={className} aria-busy={loading || undefined}>
        {body}
      </a>
    );
  return (
    <Link href={href} transitionTypes={TAB} className={className} aria-busy={loading || undefined}>
      {body}
    </Link>
  );
}
