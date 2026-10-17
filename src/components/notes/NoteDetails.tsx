"use client";
import { format, isSameDay } from "date-fns";
import type { ReactElement } from "react";
import { Calendar } from "@/components/ui/date/Calendar";
import { presetsFor } from "@/components/ui/date/presets";
import { TimePicker } from "@/components/ui/date/TimePicker";
import { ResponsivePopover } from "@/components/ui/ResponsivePopover";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useNow } from "@/lib/clock";
import type { NoteKind } from "@/lib/constants";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { KIND_ITEMS } from "./kinds";

/** Combines a calendar day with "HH:mm" (or keeps `base`'s time) → ISO string. */
export function withDayAndTime(base: Date, day: Date | null, time: string | null): string {
  const d = new Date(base);
  if (day) d.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
  if (time) {
    const [h, m] = time.split(":").map(Number);
    d.setHours(h ?? 0, m ?? 0, 0, 0);
  }
  return d.toISOString();
}

/**
 * When it happened and what it was: kind (Note/Meeting/Call/Message), past presets, calendar
 * and time. Anchored popover on desktop, sheet on phones; opened from the date line or the ⋯ menu.
 */
export function NoteDetails({
  trigger,
  open,
  onOpenChange,
  kind,
  occurredAt,
  onKind,
  onOccurredAt,
}: {
  trigger: ReactElement;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: NoteKind;
  occurredAt: Date;
  onKind: (kind: NoteKind) => void;
  onOccurredAt: (iso: string) => void;
}) {
  const now = useNow();
  const quick = presetsFor("past", new Date(now)).slice(0, 5);
  const time = format(occurredAt, "HH:mm");

  return (
    <ResponsivePopover trigger={trigger} title="Type & Date" open={open} onOpenChange={onOpenChange} done="Done" align="center" className="w-[340px] p-3">
      <div className="space-y-3">
        <SegmentedControl<NoteKind> aria-label="Type" fullWidth size="sm" value={kind} onChange={onKind} items={KIND_ITEMS} className="h-9" />
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 py-0.5 [contain:inline-size]" role="group" aria-label="Quick picks">
          {quick.map((p) => {
            const active = isSameDay(p.date, occurredAt);
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={active}
                onClick={() => onOccurredAt(withDayAndTime(occurredAt, p.date, null))}
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
        <Calendar value={occurredAt} onChange={(d) => onOccurredAt(withDayAndTime(occurredAt, d, null))} />
        <div className="border-t-[0.5px] border-separator pt-3">
          <TimePicker value={time} onChange={(t) => t && onOccurredAt(withDayAndTime(occurredAt, null, t))} />
        </div>
      </div>
    </ResponsivePopover>
  );
}
