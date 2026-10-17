"use client";
import { useCallback } from "react";
import { Avatar } from "@/components/glass/Avatar";
import { Combobox, filterByQuery } from "@/components/ui/Combobox";
import { Sheet } from "@/components/ui/Sheet";
import { usePeopleIndex } from "@/lib/queries/people";
import type { PersonIndexRow } from "@/lib/queries/types";

const MAX_RESULTS = 50;

/** "Move to person…": pick someone from the (offline-cached) people index. */
export function MovePersonSheet({
  open,
  onOpenChange,
  currentPersonId,
  onMove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPersonId: string;
  onMove: (person: Pick<PersonIndexRow, "id" | "displayName">) => void;
}) {
  const { data: people = [] } = usePeopleIndex();
  const search = useCallback(
    (q: string) =>
      filterByQuery(
        people.filter((p) => p.id !== currentPersonId),
        q,
        (p) => [p.displayName, p.company, p.headline].filter(Boolean).join(" "),
      ).slice(0, MAX_RESULTS),
    [people, currentPersonId],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Move to Person" cancel width={460} description="The note moves with its date, type and follow-ups.">
      <div className="pt-2 pb-2">
        <Combobox<PersonIndexRow>
          autoFocus
          aria-label="Person"
          placeholder="Search people"
          emptyText="No one matches"
          value={null}
          onChange={(p) => {
            if (!p) return;
            onMove(p);
            onOpenChange(false);
          }}
          search={search}
          getKey={(p) => p.id}
          getLabel={(p) => p.displayName}
          renderItem={(p) => (
            <span className="flex min-w-0 items-center gap-2.5 py-0.5">
              <Avatar name={p.displayName} src={p.avatarUrl} size={28} />
              <span className="min-w-0">
                <span className="block truncate">{p.displayName}</span>
                {(p.headline || p.company) && <span className="block truncate text-footnote text-fg-3">{[p.headline, p.company].filter(Boolean).join(" · ")}</span>}
              </span>
            </span>
          )}
        />
      </div>
    </Sheet>
  );
}
