import { StatTilesSkeleton } from "@/components/today/StatTiles";
import { Section } from "@/components/today/Section";
import { TodayHeader } from "@/components/today/TodayHeader";
import { ComposerSkeleton, ListSkeleton, SkeletonRegion } from "./parts";

/** Today while its data loads — same grid as TodayView, so nothing moves when it arrives. */
export function TodaySkeleton({ header = true }: { header?: boolean }) {
  return (
    <>
      {header && <TodayHeader />}
      <SkeletonRegion label="Loading Today">
        <ComposerSkeleton />
        <div className="mt-6">
          <StatTilesSkeleton />
        </div>
        <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] xl:gap-10">
          <Section id="due-skeleton" title="Due">
            <ListSkeleton rows={3} />
          </Section>
          <Section id="notes-skeleton" title="Recent notes">
            <ListSkeleton rows={4} avatar={false} />
          </Section>
        </div>
      </SkeletonRegion>
    </>
  );
}
