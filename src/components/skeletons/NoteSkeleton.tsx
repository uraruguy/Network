import { PageHeader } from "@/components/shell/PageHeader";
import { Bar, SkeletonRegion } from "./parts";

const LINES = ["96%", "100%", "88%", "93%", "62%", "", "97%", "84%", "100%", "71%"];

/**
 * The note editor while the note loads: inline bar (back to the person), title, meta, body lines.
 * `personId` makes the back button real; in-page: `<NoteSkeleton header={false} />`.
 */
export function NoteSkeleton({ header = true, personId }: { header?: boolean; personId?: string }) {
  return (
    <>
      {header && <PageHeader display="inline" title={<span className="sr-only">Loading note</span>} back={personId ? { href: `/people/${personId}`, label: "Back" } : undefined} />}
      <SkeletonRegion label="Loading note" className="mx-auto max-w-[720px]">
        <Bar className="h-7 w-3/5" />
        <div className="mt-3 flex gap-2">
          <Bar className="h-6 w-20 rounded-full" />
          <Bar className="h-6 w-28 rounded-full" />
        </div>
        <div className="mt-8 space-y-3">
          {LINES.map((w, i) => (w ? <Bar key={i} className="h-3.5" style={{ width: w }} /> : <div key={i} className="h-3" />))}
        </div>
      </SkeletonRegion>
    </>
  );
}
