"use client";
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

/** The detail page for `/settings/<id>`. */
export function SettingsSection({ id }: { id: SectionId }) {
  const Page = PAGES[id];
  return <Page />;
}
