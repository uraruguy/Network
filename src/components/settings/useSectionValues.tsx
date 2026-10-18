"use client";
import type { ReactNode } from "react";
import { useReadyData } from "@/lib/offline/useCacheReady";
import { useAiConnection, useEmailConnection, useProfile, useSetupStatus } from "@/lib/queries/settings";
import { useTaxonomy } from "@/lib/queries/taxonomy";
import { useThemePreference } from "@/lib/theme";
import type { SectionId } from "./nav";
import { StatusPill } from "./parts/StatusPill";

const THEME_LABEL = { system: "Auto", light: "Light", dark: "Dark" } as const;

export const formatHour = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** Trailing values for the settings list ("Auto", "07:00", "12", a status pill …). */
export function useSectionValues(): Partial<Record<SectionId, ReactNode>> & { setupRemaining: number | null; attention: Partial<Record<SectionId, "error" | "warn">> } {
  const [theme] = useThemePreference();
  // Cached values only once they may render (see useCacheReady): the server has none.
  const profile = useReadyData(useProfile());
  const taxonomy = useReadyData(useTaxonomy());
  const ai = useReadyData(useAiConnection());
  const email = useReadyData(useEmailConnection());
  const setup = useReadyData(useSetupStatus());

  const connections = (() => {
    if (!ai || !email) return undefined;
    if (ai.status === "error" || email.status === "error") return <StatusPill tone="error">Error</StatusPill>;
    if (ai.status === "off" && email.status === "off") return "Not set up";
    if (ai.status === "verified" && email.status === "verified") return <StatusPill tone="ok">Ready</StatusPill>;
    return <StatusPill tone="warn">{ai.status === "off" || email.status === "off" ? "Partly set up" : "Not tested"}</StatusPill>;
  })();

  return {
    appearance: THEME_LABEL[theme],
    digest: profile ? (profile.digestEnabled ? formatHour(profile.digestHour) : "Off") : undefined,
    categories: taxonomy?.categories.length,
    activities: taxonomy?.activities.length,
    tags: taxonomy?.tags.length,
    connections,
    setupRemaining: setup ? setup.total - setup.done : null,
    attention: {
      ...(ai && email && (ai.status === "error" || email.status === "error") ? { connections: "error" as const } : ai && email && (ai.status !== "verified" || email.status !== "verified") ? { connections: "warn" as const } : {}),
    },
  };
}
