"use client";
import { useCallback } from "react";
import { Avatar } from "@/components/glass/Avatar";
import { Combobox, filterByQuery } from "@/components/ui/Combobox";
import { usePeopleIndex } from "@/lib/queries/people";

export type PersonPick = { id: string; displayName: string; avatarUrl?: string | null; headline?: string | null; company?: string | null };

type Props = {
  value: PersonPick | null;
  onChange: (p: PersonPick | null) => void;
  placeholder?: string;
  /** Ids that can't be picked (e.g. the person being edited). */
  exclude?: string[];
  autoFocus?: boolean;
  id?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
};

/** Pick someone from your network — local, diacritic-insensitive search over the cached index. */
export function PersonPicker({ value, onChange, placeholder = "Search people", exclude, autoFocus, id, ...aria }: Props) {
  const { data: people } = usePeopleIndex();
  const excludeKey = exclude?.join(",") ?? "";
  const search = useCallback(
    (q: string): PersonPick[] => {
      const skip = new Set(excludeKey ? excludeKey.split(",") : []);
      const pool = (people ?? []).filter((p) => !skip.has(p.id));
      return filterByQuery(pool, q, (p) => [p.displayName, p.company, p.headline].filter(Boolean).join(" ")).slice(0, 30);
    },
    [people, excludeKey],
  );
  return (
    <Combobox<PersonPick>
      id={id}
      value={value}
      onChange={onChange}
      search={search}
      getKey={(p) => p.id}
      getLabel={(p) => p.displayName}
      placeholder={placeholder}
      emptyText="No one by that name"
      autoFocus={autoFocus}
      invalid={aria["aria-invalid"]}
      aria-label={aria["aria-label"] ?? placeholder}
      renderItem={(p) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar name={p.displayName} src={p.avatarUrl} size={28} />
          <span className="min-w-0">
            <span className="block truncate">{p.displayName}</span>
            {(p.headline || p.company) && <span className="block truncate text-footnote text-fg-3">{[p.headline, p.company].filter(Boolean).join(" · ")}</span>}
          </span>
        </span>
      )}
    />
  );
}
