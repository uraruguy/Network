"use client";
import { CIRCLES, type Circle } from "@/lib/db/schema";
import { CIRCLE_META, cn } from "@/lib/utils";

export function CirclePicker({ value, onChange }: { value: Circle | null; onChange: (c: Circle | null) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {CIRCLES.map((c, i) => {
        const active = value === c;
        const meta = CIRCLE_META[c];
        return (
          <button
            key={c}
            type="button"
            onClick={() => onChange(active ? null : c)}
            className={cn(
              "pressable glass specular flex flex-col items-center gap-1.5 rounded-[var(--r-md)] px-2 py-3 text-center",
              active && "ring-2 ring-accent bg-[var(--glass-strong)]",
            )}
            aria-pressed={active}
          >
            <span className="flex items-end gap-0.5" aria-hidden>
              {Array.from({ length: 3 }).map((_, j) => (
                <span
                  key={j}
                  className="w-1.5 rounded-full transition-colors"
                  style={{ height: 6 + j * 4, background: j <= i ? meta.color : "var(--fg-4)", opacity: j <= i ? 1 : 0.35 }}
                />
              ))}
            </span>
            <span className={cn("text-[12.5px] font-medium leading-tight", active ? "text-fg" : "text-fg-2")}>{meta.short}</span>
          </button>
        );
      })}
    </div>
  );
}

export function CircleBadge({ circle }: { circle: Circle | null }) {
  if (!circle) return null;
  const meta = CIRCLE_META[circle];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium" style={{ background: `color-mix(in oklab, ${meta.color} 16%, transparent)`, color: `color-mix(in oklab, ${meta.color} 75%, var(--fg))` }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
      {meta.label}
    </span>
  );
}
