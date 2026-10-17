"use client";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { WARMTH, type Warmth } from "@/lib/constants";
import { cn, WARMTH_META } from "@/lib/utils";

/** Phone segments are narrow: the longest label gets a short form below `sm`. */
const SHORT: Partial<Record<Warmth, string>> = { inner: "Inner" };

/** Warmth as an iOS segmented control, with the selected level's hint underneath. */
export function WarmthPicker({ value, onChange, id, className }: { value: Warmth; onChange: (w: Warmth) => void; id?: string; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)} id={id}>
      <SegmentedControl
        fullWidth
        size="lg"
        aria-label="Warmth"
        value={value}
        onChange={onChange}
        className="text-footnote sm:text-subhead [&_button]:gap-1 [&_button]:px-1"
        items={WARMTH.map((w) => ({
          value: w,
          ariaLabel: WARMTH_META[w].label,
          label: SHORT[w] ? (
            <>
              <span className="sm:hidden">{SHORT[w]}</span>
              <span className="hidden sm:inline">{WARMTH_META[w].label}</span>
            </>
          ) : (
            WARMTH_META[w].label
          ),
          icon: <WarmthDot warmth={w} className="hidden size-2 min-[400px]:inline-block" />,
        }))}
      />
      <p className="px-1 text-caption text-fg-3">{WARMTH_META[value].hint}</p>
    </div>
  );
}

export function WarmthDot({ warmth, className }: { warmth: Warmth; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0 rounded-full", className)}
      style={{ background: WARMTH_META[warmth].color }}
      title={WARMTH_META[warmth].label}
    />
  );
}
