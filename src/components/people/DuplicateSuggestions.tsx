"use client";
/**
 * "Possible duplicates" above the People list: people sharing a normalized name (see
 * likelyDuplicates). Tapping one opens the merge sheet with the pair, oldest card kept by
 * default; "Not the same person" hides that group on this device until someone new joins it.
 */
import { useMemo, useState } from "react";
import { Avatar } from "@/components/glass/Avatar";
import { InsetGroup } from "@/components/ui/InsetGroup";
import { ListRow } from "@/components/ui/ListRow";
import type { PeopleRow } from "@/lib/filters/people-filters";
import { groupKey, likelyDuplicates } from "./duplicates";
import { MergePersonSheet } from "./MergePersonSheet";

const HIDE_KEY = "people-duplicates-hidden";
const COLLAPSED = 3;

function readHidden(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HIDE_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function DuplicateSuggestions({ people }: { people: readonly PeopleRow[] }) {
  const [hidden, setHidden] = useState<string[]>(readHidden);
  const [expanded, setExpanded] = useState(false);
  // The group under review stays set while the sheet animates out (the row may already be gone).
  const [group, setGroup] = useState<PeopleRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const groups = useMemo(() => likelyDuplicates(people, new Set(hidden)), [people, hidden]);
  const shown = expanded ? groups : groups.slice(0, COLLAPSED);

  const hide = (key: string) => {
    const next = [...new Set([...hidden, key])];
    setHidden(next);
    try {
      localStorage.setItem(HIDE_KEY, JSON.stringify(next));
    } catch {}
  };

  return (
    <>
      {groups.length > 0 && (
        <InsetGroup header="Possible duplicates" className="mb-5">
          {shown.map((g) => (
            <ListRow
              key={groupKey(g)}
              leading={<AvatarPair people={g} />}
              label={g[0]!.displayName}
              description={[`${g.length} cards`, ...g.map((p) => p.company || p.headline).filter(Boolean)].join(" · ")}
              onClick={() => {
                setGroup(g);
                setOpen(true);
              }}
              chevron
            />
          ))}
          {groups.length > COLLAPSED && <ListRow label={<span className="text-accent-text">{expanded ? "Show fewer" : `Show all ${groups.length}`}</span>} onClick={() => setExpanded((e) => !e)} />}
        </InsetGroup>
      )}
      {group && <MergePersonSheet open={open} onOpenChange={setOpen} person={group[0]!} other={group[1]} onNotDuplicate={() => hide(groupKey(group))} />}
    </>
  );
}

function AvatarPair({ people }: { people: readonly PeopleRow[] }) {
  const [a, b] = people;
  return (
    <span aria-hidden className="relative h-9 w-[42px] shrink-0">
      <Avatar name={a!.displayName} src={a!.avatarUrl} size={28} className="absolute top-0 left-0" />
      <Avatar name={b!.displayName} src={b!.avatarUrl} size={28} className="absolute right-0 bottom-0 ring-2 ring-surface-solid" />
    </span>
  );
}
