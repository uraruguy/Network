import { PageHeader } from "@/components/shell/PageHeader";
import { Bar, ListSkeleton, SkeletonRegion } from "./parts";

const CHIP_WIDTHS = [72, 96, 64, 88, 80, 70];

/**
 * People list while the index loads: large title, search field, filter chips, person rows.
 * In-page: `<PeopleListSkeleton header={false} />` under the page's own header.
 */
export function PeopleListSkeleton({ header = true, rows = 8 }: { header?: boolean; rows?: number }) {
  return (
    <>
      {header && <PageHeader title="People" />}
      <SkeletonRegion label="Loading people">
        <div className="flex h-11 items-center gap-2.5 rounded-full bg-fill-1 px-4">
          <Bar className="size-4 rounded-full" />
          <Bar className="h-3 w-40" />
        </div>
        <div className="no-scrollbar -mx-[var(--page-px)] mt-3 flex gap-2 overflow-hidden px-[var(--page-px)] sm:mx-0 sm:px-0">
          {CHIP_WIDTHS.map((w, i) => (
            <Bar key={i} className="h-8 shrink-0 rounded-full" style={{ width: w }} />
          ))}
        </div>
        <ListSkeleton rows={rows} className="mt-4" />
      </SkeletonRegion>
    </>
  );
}
