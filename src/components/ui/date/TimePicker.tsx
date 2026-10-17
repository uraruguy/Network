"use client";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Select } from "../Select";
import { snapTime, timeOptions } from "./presets";

export type TimePickerProps = {
  /** "HH:mm" or null (no time). */
  value: string | null;
  onChange: (value: string | null) => void;
  /** Offer a "No time" chip. */
  clearable?: boolean;
  /** Minutes between Select options. Default 15. */
  step?: number;
  className?: string;
};

const QUICK = [
  { label: "Morning", value: "09:00" },
  { label: "Noon", value: "12:00" },
  { label: "Afternoon", value: "15:00" },
  { label: "Evening", value: "18:00" },
];

const chip =
  "pressable hit-44 h-8 rounded-full px-3 text-footnote font-medium whitespace-nowrap transition-colors duration-150 aria-pressed:bg-accent-fill aria-pressed:text-accent-fg";

/** Time of day: quick chips (Morning/Noon/Afternoon/Evening) plus a 15-minute Select. */
export function TimePicker({ value, onChange, clearable, step = 15, className }: TimePickerProps) {
  const options = useMemo(() => timeOptions(step).map((t) => ({ value: t, label: t })), [step]);
  const snapped = value ? snapTime(value, step) : null;
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="no-scrollbar -mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1 py-1 [contain:inline-size]">
        {clearable && (
          <button type="button" aria-pressed={value === null} onClick={() => onChange(null)} className={cn(chip, "bg-fill-2 text-fg-2")}>
            No time
          </button>
        )}
        {QUICK.map((q) => (
          <button key={q.value} type="button" aria-pressed={value === q.value} onClick={() => onChange(q.value)} className={cn(chip, "bg-fill-2 text-fg-2")}>
            {q.label}
          </button>
        ))}
      </div>
      <div className="w-[104px] shrink-0">
        <Select aria-label="Time" size="sm" value={snapped} onChange={(t) => onChange(t)} options={options} placeholder="--:--" />
      </div>
    </div>
  );
}
