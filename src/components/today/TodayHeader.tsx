"use client";
import { Plus } from "lucide-react";
import { GlassButton } from "@/components/glass/GlassButton";
import { openQuickAdd } from "@/components/people/QuickAddPersonSheet";
import { PageHeader } from "@/components/shell/PageHeader";
import { useHydrated } from "@/components/shell/useHydrated";
import { IconButton } from "@/components/ui/IconButton";
import { useNow } from "@/lib/clock";
import { formatDate } from "@/lib/format";
import { useProfile } from "@/lib/queries/misc";
import { greeting } from "./today-data";

/**
 * Greeting + date. Both depend on the device clock, so the server/hydration render reserves
 * their space invisibly (no layout shift, no mismatch) and the real text appears after hydration.
 * "New person" opens the app-wide quick-add sheet (mounted once by AppShell).
 */
export function TodayHeader() {
  const hydrated = useHydrated();
  const now = useNow();
  const { data: profile } = useProfile();
  const add = () => openQuickAdd();

  return (
    <PageHeader
      eyebrow={hydrated ? formatDate(now, { weekday: "long", day: "numeric", month: "long", year: undefined }) : <span className="invisible">Today</span>}
      title={hydrated ? greeting(now, profile?.displayName) : <span className="invisible">Good evening</span>}
      compactTitle="Today"
      actions={
        <>
          {/* Round glass button on phones (iOS nav bar), labelled on desktop. One is display:none. */}
          <IconButton variant="glass" size="lg" label="New person" icon={<Plus strokeWidth={2.4} />} onClick={add} className="lg:hidden" />
          <GlassButton variant="glass" onClick={add} className="hidden lg:inline-flex">
            <Plus size={18} strokeWidth={2.4} aria-hidden /> New person
          </GlassButton>
        </>
      }
    />
  );
}
