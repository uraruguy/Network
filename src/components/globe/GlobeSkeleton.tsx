import { cn } from "@/lib/utils";

/** Soft turquoise planet shown while the map chunk, the data or the first tiles load. */
export function GlobeSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 grid place-items-center pb-[var(--chrome-bottom)]", className)} role="status" aria-label="Loading the globe">
      <div className="size-[min(68vmin,560px)] animate-pulse rounded-full bg-[radial-gradient(circle_at_38%_34%,var(--accent-100),var(--accent-200)_55%,var(--accent-300))] opacity-50 shadow-e3 motion-reduce:animate-none dark:bg-[radial-gradient(circle_at_38%_34%,var(--accent-800),var(--accent-900)_55%,var(--accent-950))]" />
    </div>
  );
}
