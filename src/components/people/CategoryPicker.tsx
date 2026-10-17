"use client";
import { Skeleton } from "@/components/ui/Skeleton";
import { ToggleChip } from "@/components/ui/ToggleChip";
import { useCategories } from "@/lib/queries/people";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "./CategoryIcon";

/** Multi-select category chips, tinted with each category's palette colour. */
export function CategoryPicker({ value, onChange, id, className }: { value: string[]; onChange: (ids: string[]) => void; id?: string; className?: string }) {
  const { data: categories, isPending } = useCategories();
  const toggle = (catId: string, on: boolean) => onChange(on ? [...value, catId] : value.filter((v) => v !== catId));
  return (
    <div id={id} role="group" aria-label="Categories" className={cn("flex flex-wrap gap-2", className)}>
      {isPending && !categories
        ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 rounded-full" style={{ width: 72 + ((i * 23) % 40) }} />)
        : categories?.map((c) => (
            <ToggleChip key={c.id} pressed={value.includes(c.id)} onPressedChange={(on) => toggle(c.id, on)} color={c.color} icon={<CategoryIcon name={c.icon} />}>
              {c.name}
            </ToggleChip>
          ))}
    </div>
  );
}
