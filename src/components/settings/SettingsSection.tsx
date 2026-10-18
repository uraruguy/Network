"use client";
import { SettingsSkeleton } from "@/components/skeletons/SettingsSkeleton";
import { useCacheReady } from "@/lib/offline/useCacheReady";
import type { SectionId } from "./nav";
import { ActivitiesSection } from "./sections/ActivitiesSection";
import { AppearanceSection } from "./sections/AppearanceSection";
import { CategoriesSection } from "./sections/CategoriesSection";
import { ConnectionsSection } from "./sections/ConnectionsSection";
import { DataSection } from "./sections/DataSection";
import { DigestSection } from "./sections/DigestSection";
import { ConnectedAppsPage, SecurityPage } from "./sections/MountedSections";
import { ProfileSection } from "./sections/ProfileSection";
import { SetupSection } from "./sections/SetupSection";
import { TagsSection } from "./sections/TagsSection";

const PAGES: Record<SectionId, () => React.ReactNode> = {
  profile: ProfileSection,
  appearance: AppearanceSection,
  digest: DigestSection,
  categories: CategoriesSection,
  activities: ActivitiesSection,
  tags: TagsSection,
  connections: ConnectionsSection,
  apps: ConnectedAppsPage,
  security: SecurityPage,
  data: DataSection,
  setup: SetupSection,
};

/**
 * The detail page for `/settings/<id>`. Sections render from the offline cache, so they wait for
 * it to be renderable (see useCacheReady): the statically generated HTML and the hydration render
 * then agree on the skeleton. Client-side navigations render the section straight away.
 */
export function SettingsSection({ id }: { id: SectionId }) {
  const ready = useCacheReady();
  const Page = PAGES[id];
  return ready ? <Page /> : <SettingsSkeleton header={false} />;
}
