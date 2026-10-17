import { Bar, SkeletonRegion } from "./parts";

/**
 * Globe / graph while the scene loads: a full-bleed stage with a softly lit sphere and the
 * floating glass controls in their final places. Fills its container (the shell renders these
 * routes edge to edge); in-page it can sit behind a loading WebGL canvas.
 */
export function GlobeSkeleton({ className }: { className?: string }) {
  return (
    <SkeletonRegion label="Loading map" className={className ?? "relative h-dvh w-full overflow-hidden"}>
      <div className="absolute inset-0 grid place-items-center">
        <div
          aria-hidden
          className="ui-skeleton aspect-square w-[min(78vw,64dvh)] rounded-full opacity-80"
          style={{ boxShadow: "inset -24px -32px 80px var(--fill-2), 0 40px 120px -40px var(--accent-soft)" }}
        />
      </div>
      {/* Top controls (view switch + filters) */}
      <div className="absolute inset-x-0 top-[calc(var(--sat)+12px)] flex justify-center gap-2 px-4 lg:top-6">
        <div className="glass flex h-11 w-56 items-center gap-2 rounded-full px-1.5">
          <Bar className="h-8 flex-1 rounded-full" />
          <Bar className="h-8 flex-1 rounded-full opacity-50" />
        </div>
        <div className="glass size-11 rounded-full" />
      </div>
    </SkeletonRegion>
  );
}
