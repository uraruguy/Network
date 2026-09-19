"use client";
import { Chip } from "@/components/glass/Chip";
import { useCategories } from "@/lib/queries/people";
import { CategoryIcon } from "./CategoryIcon";

export function CategoryPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { data: cats = [] } = useCategories();
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <div className="flex flex-wrap gap-2">
      {cats.map((c) => {
        const active = value.includes(c.id);
        return (
          <button key={c.id} type="button" onClick={() => toggle(c.id)} className="pressable" aria-pressed={active}>
            <Chip color={c.color} active={active}>
              <CategoryIcon name={c.icon} size={14} />
              {c.name}
            </Chip>
          </button>
        );
      })}
    </div>
  );
}
