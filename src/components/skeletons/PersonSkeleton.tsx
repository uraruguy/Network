import { PageHeader } from "@/components/shell/PageHeader";
import { Bar, InsetGroupSkeleton, ListSkeleton, SkeletonRegion } from "./parts";

/**
 * A person's profile while it loads: inline nav bar with "People" back button, hero (avatar,
 * name, subtitle, quick actions), then grouped sections.
 * In-page: `<PersonSkeleton header={false} />`.
 */
export function PersonSkeleton({ header = true }: { header?: boolean }) {
  return (
    <>
      {header && <PageHeader display="inline" title={<span className="sr-only">Loading person</span>} back={{ href: "/people", label: "People" }} />}
      <SkeletonRegion label="Loading person">
        <div className="flex flex-col items-center pt-2 pb-6 text-center">
          <Bar className="size-24 rounded-full" />
          <Bar className="mt-4 h-6 w-48" />
          <Bar className="mt-2.5 h-3.5 w-32" />
          <div className="mt-5 flex gap-2.5">
            {[0, 1, 2, 3].map((i) => (
              <Bar key={i} className="h-14 w-16 rounded-md" />
            ))}
          </div>
        </div>
        <div className="space-y-6">
          <InsetGroupSkeleton rows={3} />
          <div className="space-y-1.5">
            <div className="flex h-[18px] items-center px-4">
              <Bar className="h-2.5 w-16" />
            </div>
            <ListSkeleton rows={3} avatar={false} />
          </div>
        </div>
      </SkeletonRegion>
    </>
  );
}
