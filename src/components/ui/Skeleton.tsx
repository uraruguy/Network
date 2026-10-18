import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * Loading placeholders. They fade in only after 150ms, so a fast cache restore (IndexedDB,
 * TanStack persist) never flashes grey boxes. Shimmer stops under reduced motion.
 */
export function Skeleton({ className, style, reveal = true }: { className?: string; style?: CSSProperties; reveal?: boolean }) {
  return <div aria-hidden className={cn("ui-skeleton rounded-xs", reveal && "ui-skeleton-reveal", className)} style={style} />;
}

const LINE_WIDTHS = ["92%", "100%", "78%", "86%", "64%"];

/** Paragraph placeholder: `lines` bars at body line height, last one shorter. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={cn("ui-skeleton-reveal space-y-2.5 py-1", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          reveal={false}
          className="h-3.5 rounded-full"
          style={{ width: i === lines - 1 && lines > 1 ? "56%" : LINE_WIDTHS[i % LINE_WIDTHS.length] }}
        />
      ))}
    </div>
  );
}

/** List placeholder matching `ListRow` / person rows (44–60px). */
export function SkeletonRows({ count = 5, avatar = true, className }: { count?: number; avatar?: boolean; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={cn("ui-skeleton-reveal", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex min-h-[60px] items-center gap-3 px-4 py-2.5">
          {avatar && <Skeleton reveal={false} className="size-10 shrink-0 rounded-full" />}
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton reveal={false} className="h-3.5 rounded-full" style={{ width: `${48 + ((i * 17) % 30)}%` }} />
            <Skeleton reveal={false} className="h-3 rounded-full" style={{ width: `${30 + ((i * 23) % 25)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
