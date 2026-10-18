"use client";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { CIRCLES, type Circle } from "@/lib/constants";
import { CIRCLE_META, cn } from "@/lib/utils";

/** Sentinel for "no circle" — SegmentedControl needs a value; nothing is shown selected. */
const NONE = "none" as const;

/**
 * Circle as a segmented control. It's optional: tap the selected segment again (or "Clear")
 * to unset it.
 */
export function CirclePicker({ value, onChange, id, className }: { value: Circle | null; onChange: (c: Circle | null) => void; id?: string; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)} id={id}>
      <SegmentedControl<Circle | typeof NONE>
        fullWidth
        size="lg"
        aria-label="Circle"
        value={value ?? NONE}
        onChange={(c) => onChange(c === NONE || c === value ? null : c)}
        className="text-footnote sm:text-subhead [&_button]:px-1"
        items={CIRCLES.map((c) => ({ value: c, label: CIRCLE_META[c].short, ariaLabel: CIRCLE_META[c].label }))}
      />
      <div className="flex min-h-5 items-center justify-between gap-2 px-1 text-caption text-fg-3">
        <span>{value ? CIRCLE_META[value].hint : "Optional — where this could go"}</span>
        {value && (
          <button type="button" onClick={() => onChange(null)} className="hit-44 relative font-medium text-accent-text">
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

export function CircleBadge({ circle, className }: { circle: Circle | null; className?: string }) {
  if (!circle) return null;
  const meta = CIRCLE_META[circle];
  return (
    <span
      className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-caption font-medium whitespace-nowrap", className)}
      style={{ background: `color-mix(in oklab, ${meta.color} 16%, transparent)`, color: `color-mix(in oklab, ${meta.color} 70%, var(--fg))` }}
    >
      <span aria-hidden className="size-1.5 rounded-full" style={{ background: meta.color }} />
      {meta.label}
    </span>
  );
}
