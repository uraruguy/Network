"use client";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useReadyData } from "@/lib/offline/useCacheReady";
import { usePersonDetail } from "@/lib/queries/people";
import { PersonNotesSection } from "./PersonNotesSection";

/** /people/[id]/notes — a person's notes on their own page. */
export function PersonNotesPage({ personId }: { personId: string }) {
  const person = useReadyData(usePersonDetail(personId));
  const name = person?.displayName ?? "";
  return (
    <div className="mx-auto max-w-[720px] space-y-4 pb-8">
      <Link
        href={`/people/${personId}`}
        transitionTypes={["nav-back"]}
        className="pressable -ml-2 inline-flex h-11 items-center gap-0.5 rounded-full pr-3 pl-1 text-body text-accent-text hover:bg-accent-soft"
      >
        <ChevronLeft size={26} strokeWidth={2.2} aria-hidden />
        {name || "Back"}
      </Link>
      <PersonNotesSection personId={personId} personName={name} />
    </div>
  );
}
