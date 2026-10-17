/**
 * Route skeletons — used by every `loading.tsx` under (app) and reusable by feature screens for
 * their in-page pending state (`!useQueryReady(query)` from lib/offline/useCacheReady). Each takes `header={false}` to
 * render only the body under the page's own header. They fade in after 150ms, so a warm
 * IndexedDB restore never flashes them.
 */
export { TodaySkeleton } from "./TodaySkeleton";
export { PeopleListSkeleton } from "./PeopleListSkeleton";
export { PersonSkeleton } from "./PersonSkeleton";
export { NoteSkeleton } from "./NoteSkeleton";
export { ChatSkeleton } from "./ChatSkeleton";
export { SettingsSkeleton } from "./SettingsSkeleton";
export { GlobeSkeleton } from "./GlobeSkeleton";
export { Bar, ComposerSkeleton, InlineBar, InsetGroupSkeleton, ListSkeleton, SectionTitleSkeleton, SkeletonRegion } from "./parts";
