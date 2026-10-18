import type { CSSProperties, ReactNode } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

/**
 * Building blocks for page skeletons. Everything inside a <SkeletonRegion> fades in after 150ms
 * (one reveal for the whole region, not per bar), so a warm cache restore never flashes.
 */
export function SkeletonRegion({ children, className, label = "Loading" }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <div role="status" aria-label={label} aria-busy className={cn("ui-skeleton-reveal", className)}>
      {children}
    </div>
  );
}

/** A shimmer bar (no reveal of its own — put it inside a SkeletonRegion). */
export function Bar({ className, style }: { className?: string; style?: CSSProperties }) {
  return <Skeleton reveal={false} className={cn("h-3.5 rounded-full", className)} style={style} />;
}

/** Inline shimmer for places that need phrasing content (inside headings, buttons). */
export function InlineBar({ className, style }: { className?: string; style?: CSSProperties }) {
  return <span aria-hidden className={cn("ui-skeleton inline-block h-[0.8em] rounded-full align-middle", className)} style={style} />;
}

/** Section title placeholder matching `text-title3` headings. */
export function SectionTitleSkeleton({ width = 112, className }: { width?: number; className?: string }) {
  return (
    <div className={cn("flex h-[25px] items-center px-1", className)}>
      <Bar className="h-4" style={{ width }} />
    </div>
  );
}

/**
 * Grouped list placeholder: a `surface` card of rows (60px with avatar, 52px without),
 * separated like ListRow.
 */
export function ListSkeleton({ rows = 4, avatar = true, lines = 2, className }: { rows?: number; avatar?: boolean; lines?: 1 | 2; className?: string }) {
  return (
    <div className={cn("surface overflow-hidden rounded-lg", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={cn("relative flex items-center gap-3 px-4", avatar ? "min-h-[64px]" : "min-h-[52px]")}>
          {avatar ? <Bar className="size-10 shrink-0 rounded-full" /> : <Bar className="size-[30px] shrink-0 rounded-xs" />}
          <div className="min-w-0 flex-1 space-y-2">
            <Bar style={{ width: `${46 + ((i * 17) % 30)}%` }} />
            {lines === 2 && <Bar className="h-3" style={{ width: `${30 + ((i * 23) % 28)}%` }} />}
          </div>
          {i < rows - 1 && <span aria-hidden className={cn("absolute right-0 bottom-0 h-[0.5px] bg-separator", avatar ? "left-[68px]" : "left-[58px]")} />}
        </div>
      ))}
    </div>
  );
}

/** Placeholder for <Composer>: same capsule height and the hover-device hint row beneath. */
export function ComposerSkeleton({ className, hint = true }: { className?: string; hint?: boolean }) {
  return (
    <div className={className}>
      <div className="glass-thick specular flex h-[49px] items-center gap-3 rounded-xl p-1.5 pl-4">
        <Bar className="h-3.5 w-2/5" />
        <span className="ml-auto size-9 shrink-0 rounded-full bg-fill-2" />
      </div>
      {hint && <div aria-hidden className="mt-1.5 hidden h-4 [@media(hover:hover)]:block" />}
    </div>
  );
}

/** Inset-grouped settings card placeholder (icon tile + label + value). */
export function InsetGroupSkeleton({ rows = 3, header = true }: { rows?: number; header?: boolean }) {
  return (
    <div className="space-y-1.5">
      {header && (
        <div className="flex h-[18px] items-center px-4">
          <Bar className="h-2.5 w-20" />
        </div>
      )}
      <div className="surface overflow-hidden rounded-lg">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="relative flex min-h-11 items-center gap-3 px-4 py-2.5">
            <Bar className="size-[30px] shrink-0 rounded-xs" />
            <Bar className="h-3.5" style={{ width: `${34 + ((i * 19) % 26)}%` }} />
            <Bar className="ml-auto h-3 w-12" />
            {i < rows - 1 && <span aria-hidden className="absolute right-0 bottom-0 left-[58px] h-[0.5px] bg-separator" />}
          </div>
        ))}
      </div>
    </div>
  );
}
