"use client";
import { isSameDay } from "date-fns";
import { CalendarDays, X } from "lucide-react";
import { useState } from "react";
import { useNow } from "@/lib/clock";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ResponsivePopover } from "../ResponsivePopover";
import { fieldTrigger } from "../styles";
import { Calendar } from "./Calendar";
import { fromISODate, presetsFor, toISODate, type PresetKind } from "./presets";
import { TimePicker } from "./TimePicker";

export type DateFieldProps = {
  /** Local calendar date "yyyy-MM-dd", or null. */
  value: string | null;
  onChange: (value: string | null) => void;
  /** Quick picks above the calendar. Default "none". */
  presets?: PresetKind;
  /** Inclusive bounds, "yyyy-MM-dd". */
  min?: string;
  max?: string;
  /** Show a clear (×) button when a date is set. */
  clearable?: boolean;
  placeholder?: string;
  /** Picker title (sheet header on phones). Default "Date". */
  label?: string;
  /** Add a time row (value "HH:mm" via `time` / `onTimeChange`). */
  withTime?: boolean;
  time?: string | null;
  onTimeChange?: (time: string | null) => void;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  "aria-label"?: string;
  className?: string;
};

/**
 * Date input replacement for `<input type="date">`. The trigger reads "Tue, 14 Oct"
 * (+ " · 09:30" with time); it opens preset chips + a calendar in a popover on desktop and a
 * bottom sheet on phones. Picking a date closes it (unless `withTime`, where "Done" closes).
 */
export function DateField({
  value,
  onChange,
  presets = "none",
  min,
  max,
  clearable,
  placeholder = "Add date",
  label = "Date",
  withTime,
  time = null,
  onTimeChange,
  disabled,
  invalid,
  id,
  className,
  ...aria
}: DateFieldProps) {
  const now = useNow();
  const [open, setOpen] = useState(false);
  const date = fromISODate(value);
  const minD = fromISODate(min);
  const maxD = fromISODate(max);
  const quick = presetsFor(presets, new Date(now), { min: minD, max: maxD });
  const display = date ? `${formatShortDate(date, now)}${withTime && time ? ` · ${time}` : ""}` : null;

  const pick = (d: Date, close: () => void) => {
    onChange(toISODate(d));
    if (!withTime) close();
  };

  return (
    <div className={cn("relative", className)}>
      <ResponsivePopover
        open={open}
        onOpenChange={setOpen}
        title={label}
        done={withTime ? "Done" : undefined}
        className="w-[340px] p-3"
        trigger={
          <button
            type="button"
            id={id}
            disabled={disabled}
            aria-label={aria["aria-label"] ?? (display ? `${label}: ${display}` : label)}
            data-invalid={invalid || undefined}
            className={cn(fieldTrigger, clearable && date && "pr-11")}
          >
            <CalendarDays size={18} className="shrink-0 text-fg-3" aria-hidden />
            <span className={cn("min-w-0 flex-1 truncate", !display && "text-fg-4")}>{display ?? placeholder}</span>
          </button>
        }
      >
        {(close) => (
          <div className="space-y-3">
            {quick.length > 0 && (
              <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 py-0.5 [contain:inline-size]" role="group" aria-label="Quick picks">
                {quick.map((p) => {
                  const active = !!date && isSameDay(p.date, date);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => pick(p.date, close)}
                      className={cn(
                        "pressable flex shrink-0 flex-col items-start rounded-sm px-3 py-1.5 text-left transition-colors duration-150",
                        active ? "bg-accent-fill text-accent-fg" : "bg-fill-1 text-fg hover:bg-fill-2",
                      )}
                    >
                      <span className="text-footnote font-semibold whitespace-nowrap">{p.label}</span>
                      <span className={cn("text-caption whitespace-nowrap", active ? "text-accent-fg/80" : "text-fg-3")}>{formatShortDate(p.date, now)}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <Calendar value={date} onChange={(d) => pick(d, close)} min={minD} max={maxD} />
            {withTime && (
              <div className="border-t-[0.5px] border-separator pt-3">
                <TimePicker value={time} onChange={(t) => onTimeChange?.(t)} clearable />
              </div>
            )}
          </div>
        )}
      </ResponsivePopover>
      {clearable && date && !disabled && (
        <button
          type="button"
          aria-label={`Clear ${label.toLowerCase()}`}
          onClick={() => onChange(null)}
          className="hit-44 absolute top-1/2 right-3 grid size-[22px] -translate-y-1/2 place-items-center rounded-full bg-fill-2 text-fg-3 hover:bg-fill-3 hover:text-fg"
        >
          <X size={13} strokeWidth={2.6} />
        </button>
      )}
    </div>
  );
}
