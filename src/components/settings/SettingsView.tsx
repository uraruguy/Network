"use client";
import Link from "next/link";
import { Avatar } from "@/components/glass/Avatar";
import { useReadyData } from "@/lib/offline/useCacheReady";
import { useProfile } from "@/lib/queries/settings";
import { SettingsIndexList } from "./SettingsNav";
import { SetupChecklist } from "./sections/SetupSection";

/**
 * `/settings`. Phones: the grouped index (every section drills in). Desktop: the sidebar already
 * lists the sections, so the detail pane shows an overview — who you are and what's left to set up.
 */
export function SettingsView() {
  const profile = useReadyData(useProfile());
  return (
    <>
      <div className="mx-auto max-w-[680px] lg:hidden">
        <h1 className="mb-4 text-large-title">Settings</h1>
        <SettingsIndexList />
        <p className="pt-6 pb-2 text-center text-caption text-fg-4">The Network</p>
      </div>

      <div className="hidden max-w-[680px] space-y-7 lg:block">
        <Link href="/settings/profile" className="surface pressable flex items-center gap-4 rounded-lg p-4 hover:bg-surface-2">
          <Avatar name={profile?.displayName || profile?.email || "?"} size={64} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-title2">{profile?.displayName || "Add your name"}</span>
            <span className="block truncate text-subhead text-fg-3">
              {profile?.email}
              {profile?.homeLocation ? ` · ${profile.homeLocation.name}` : ""}
            </span>
          </span>
        </Link>
        <section className="space-y-3">
          <h2 className="px-1 text-title3">Setup</h2>
          <SetupChecklist compact />
        </section>
      </div>
    </>
  );
}
