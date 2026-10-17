import { PageHeader } from "@/components/shell/PageHeader";
import { InsetGroupSkeleton, SkeletonRegion } from "./parts";

/**
 * Settings-style screen while it loads: large title + inset-grouped cards. Also used for Import
 * (`title="Import"`). In-page: `<SettingsSkeleton header={false} />`.
 */
export function SettingsSkeleton({ header = true, title = "Settings", groups = [3, 2, 4] }: { header?: boolean; title?: string; groups?: number[] }) {
  return (
    <>
      {header && <PageHeader title={title} />}
      <SkeletonRegion label={`Loading ${title.toLowerCase()}`} className="mx-auto max-w-[720px] space-y-7">
        {groups.map((rows, i) => (
          <InsetGroupSkeleton key={i} rows={rows} />
        ))}
      </SkeletonRegion>
    </>
  );
}
