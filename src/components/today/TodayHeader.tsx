"use client";
import dynamic from "next/dynamic";
import { Plus } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { useHydrated } from "@/components/shell/useHydrated";
import { IconButton } from "@/components/ui/IconButton";
import { Tooltip } from "@/components/ui/Tooltip";
import { useNow } from "@/lib/clock";
import { formatDate } from "@/lib/format";
import { useProfile } from "@/lib/queries/misc";
import { greeting } from "./today-data";

// The person form is heavy and rarely needed on first paint: load it on first open.
const NewPersonSheet = dynamic(() => import("@/components/people/PersonSheet").then((m) => m.NewPersonSheet), { ssr: false });

/**
 * Greeting + date. Both depend on the device clock, so the server/hydration render reserves
 * their space invisibly (no layout shift, no mismatch) and the real text appears after hydration.
 */
export function TodayHeader() {
  const hydrated = useHydrated();
  const now = useNow();
  const { data: profile } = useProfile();
  const [sheet, setSheet] = useState<"closed" | "open" | "idle">("idle");

  return (
    <>
      <PageHeader
        eyebrow={hydrated ? formatDate(now, { weekday: "long", day: "numeric", month: "long", year: undefined }) : <span className="invisible">Today</span>}
        title={hydrated ? greeting(now, profile?.displayName) : <span className="invisible">Good evening</span>}
        compactTitle="Today"
        actions={
          <Tooltip content="New person">
            <IconButton variant="glass" size="lg" label="New person" icon={<Plus strokeWidth={2.4} />} onClick={() => setSheet("open")} />
          </Tooltip>
        }
      />
      {sheet !== "idle" && <NewPersonSheet open={sheet === "open"} onClose={() => setSheet("closed")} />}
    </>
  );
}
