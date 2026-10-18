"use client";
import { ArrowUpDown, Check } from "lucide-react";
import { Menu } from "@/components/ui/Menu";
import { SORT_KEYS, SORT_META, type SortKey } from "@/lib/filters/sort";
import { FilterPill } from "./FilterPill";

/** Sort pill: dropdown menu on desktop, action sheet on touch phones. The current order carries a check. */
export function SortMenu({ value, onChange, className }: { value: SortKey; onChange: (sort: SortKey) => void; className?: string }) {
  return (
    <Menu
      title="Sort by"
      align="start"
      trigger={<FilterPill icon={<ArrowUpDown strokeWidth={2.4} aria-hidden />} label={SORT_META[value].label} aria-label={`Sort by: ${SORT_META[value].label}`} className={className} />}
      items={SORT_KEYS.map((key) => ({
        label: SORT_META[key].label,
        icon: key === value ? <Check strokeWidth={3} className="!text-accent-text" /> : <span aria-hidden className="size-[17px] shrink-0" />,
        onSelect: () => onChange(key),
      }))}
    />
  );
}
