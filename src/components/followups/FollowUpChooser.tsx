"use client";
import { CalendarDays, Clock, Repeat } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useId, useMemo, useState } from "react";
import { GlassTextarea } from "@/components/glass/GlassInput";
import { Calendar } from "@/components/ui/date/Calendar";
import { fromISODate, toISODate } from "@/components/ui/date/presets";
import { TimePicker } from "@/components/ui/date/TimePicker";
import { NumberField } from "@/components/ui/NumberField";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { ToggleChip } from "@/components/ui/ToggleChip";
import { useNow } from "@/lib/clock";
import { formatShortDate } from "@/lib/format";
import { collapse } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { dayPresets, digestTime, REPEAT_PRESETS, type RepeatUnit, type RepeatValue } from "./recurrence";

export type FollowUpValue = {
  /** Local day "yyyy-MM-dd" (null until picked). */
  date: string | null;
  /** "HH:mm", or null for the morning digest hour. */
  time: string | null;
  repeat: RepeatValue;
  message: string;
};

type Props = {
  value: FollowUpValue;
  onChange: (value: FollowUpValue) => void;
  /** Profile digest hour (0–23): the default time. */
  digestHour?: number | null;
  /** Message placeholder, e.g. "Ask Ana how the move went". */
  messagePlaceholder?: string;
  className?: string;
};

const UNITS: { value: RepeatUnit; label: string }[] = [
  { value: "days", label: "Days" },
  { value: "weeks", label: "Weeks" },
  { value: "months", label: "Months" },
];

/** Compact day label under a preset: "Sat 18" within two weeks, "18 Jan" beyond. */
function tileDate(iso: string, now: number) {
  const d = fromISODate(iso)!;
  const days = (d.getTime() - now) / 86_400_000;
  return days < 13 ? new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric" }).format(d) : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(d);
}

/**
 * The follow-up picker body: day presets (Tomorrow … 6 months, Custom → inline calendar), an
 * optional time (defaults to the morning digest), repeat, and a message. Controlled.
 */
export function FollowUpChooser({ value, onChange, digestHour, messagePlaceholder = "What about? (optional)", className }: Props) {
  const uid = useId();
  const ids = { when: `${uid}-when`, repeat: `${uid}-repeat`, msg: `${uid}-msg` };
  const now = useNow();
  const presets = useMemo(() => dayPresets(now), [now]);
  const matched = presets.find((p) => p.date === value.date);
  const [customOpen, setCustomOpen] = useState(() => !!value.date && !matched);
  const [timeOpen, setTimeOpen] = useState(() => value.time !== null);
  const set = (patch: Partial<FollowUpValue>) => onChange({ ...value, ...patch });
  const setRepeat = (patch: Partial<RepeatValue>) => set({ repeat: { ...value.repeat, ...patch } });
  const today = toISODate(new Date(now));
  const customActive = customOpen || (!!value.date && !matched);

  return (
    <div className={cn("space-y-5", className)}>
      {/* When */}
      <section aria-labelledby={ids.when} className="space-y-2">
        <h3 id={ids.when} className="px-1 text-footnote font-medium text-fg-3 uppercase">
          When
        </h3>
        <div role="group" aria-labelledby={ids.when} className="grid grid-cols-4 gap-1.5">
          {presets.map((p) => {
            const active = !customOpen && value.date === p.date;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={active}
                aria-label={`${p.label}, ${formatShortDate(fromISODate(p.date), now)}`}
                onClick={() => {
                  setCustomOpen(false);
                  set({ date: p.date });
                }}
                className={cn(
                  "pressable flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-sm px-1 py-2 text-center transition-colors duration-150",
                  active ? "bg-accent-fill text-accent-fg" : "bg-fill-1 text-fg hover:bg-fill-2",
                )}
              >
                <span className="max-w-full truncate text-footnote font-semibold">
                  <span className="sm:hidden">{p.short}</span>
                  <span className="hidden sm:inline">{p.label}</span>
                </span>
                <span className={cn("text-caption2 tabular-nums", active ? "text-accent-fg/85" : "text-fg-3")}>{tileDate(p.date, now)}</span>
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={customActive}
            aria-expanded={customOpen}
            // Presets that land on the same day are merged, so fill the last row.
            style={{ gridColumn: `span ${4 - (presets.length % 4)} / span ${4 - (presets.length % 4)}` }}
            onClick={() => setCustomOpen((o) => !o)}
            className={cn(
              "pressable flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-sm px-1 py-2 text-center transition-colors duration-150",
              customActive ? "bg-accent-fill text-accent-fg" : "bg-fill-1 text-fg hover:bg-fill-2",
            )}
          >
            <span className="flex items-center gap-1 text-footnote font-semibold">
              <CalendarDays size={13} strokeWidth={2.4} aria-hidden />
              Custom
            </span>
            <span className={cn("text-caption2 tabular-nums", customActive ? "text-accent-fg/85" : "text-fg-3")}>
              {customActive && value.date ? tileDate(value.date, now) : "Pick a day"}
            </span>
          </button>
        </div>
        <AnimatePresence initial={false}>
          {customOpen && (
            <motion.div key="cal" variants={collapse} initial="initial" animate="animate" exit="exit" className="overflow-hidden">
              <div className="surface mt-1 rounded-lg p-3">
                <Calendar value={fromISODate(value.date)} min={fromISODate(today)} onChange={(d) => set({ date: toISODate(d) })} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Time */}
      <section className="surface overflow-hidden rounded-lg">
        <div className="flex min-h-12 items-center gap-3 pr-2 pl-4">
          <Clock size={18} className="shrink-0 text-accent-text" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-body">
            {value.time ? (
              <>
                At <span className="tabular-nums">{value.time}</span>
              </>
            ) : (
              <>
                Morning digest <span className="text-fg-3 tabular-nums">· {digestTime(digestHour)}</span>
              </>
            )}
          </span>
          {!timeOpen ? (
            <button
              type="button"
              onClick={() => {
                setTimeOpen(true);
                set({ time: "09:00" });
              }}
              className="pressable h-11 rounded-full px-3 text-body text-accent-text hover:bg-accent-soft">
              Add time
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setTimeOpen(false);
                set({ time: null });
              }}
              className="pressable h-11 rounded-full px-3 text-body text-accent-text hover:bg-accent-soft"
            >
              Use digest
            </button>
          )}
        </div>
        <AnimatePresence initial={false}>
          {timeOpen && (
            <motion.div key="time" variants={collapse} initial="initial" animate="animate" exit="exit" className="overflow-hidden">
              <div className="border-t-[0.5px] border-separator px-3 py-2.5">
                <TimePicker value={value.time} onChange={(t) => set({ time: t })} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Repeat */}
      <section aria-labelledby={ids.repeat} className="space-y-2">
        <h3 id={ids.repeat} className="flex items-center gap-1.5 px-1 text-footnote font-medium text-fg-3 uppercase">
          <Repeat size={13} strokeWidth={2.4} aria-hidden />
          Repeat
        </h3>
        <div role="radiogroup" aria-labelledby={ids.repeat} className="flex flex-wrap gap-2">
          {REPEAT_PRESETS.map((r) => (
            <ToggleChip
              key={r.value}
              role="radio"
              aria-checked={value.repeat.preset === r.value}
              aria-pressed={undefined}
              pressed={value.repeat.preset === r.value}
              onPressedChange={() => setRepeat({ preset: r.value })}
            >
              {r.label}
            </ToggleChip>
          ))}
        </div>
        <AnimatePresence initial={false}>
          {value.repeat.preset === "custom" && (
            <motion.div key="custom" variants={collapse} initial="initial" animate="animate" exit="exit" className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="pl-1 text-subhead text-fg-2">Every</span>
                <NumberField
                  aria-label="Repeat every"
                  value={value.repeat.every}
                  onChange={(n) => setRepeat({ every: n ?? 1 })}
                  min={1}
                  max={value.repeat.unit === "days" ? 365 : value.repeat.unit === "weeks" ? 104 : 36}
                  className="w-36"
                />
                <SegmentedControl aria-label="Repeat unit" size="lg" value={value.repeat.unit} onChange={(unit) => setRepeat({ unit })} items={UNITS} className="min-w-0 flex-1" fullWidth />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Message */}
      <section aria-labelledby={ids.msg} className="space-y-2">
        <h3 id={ids.msg} className="px-1 text-footnote font-medium text-fg-3 uppercase">
          Note to self
        </h3>
        <GlassTextarea
          aria-labelledby={ids.msg}
          value={value.message}
          maxLength={2000}
          rows={2}
          placeholder={messagePlaceholder}
          onChange={(e) => set({ message: e.target.value })}
          className="min-h-20"
        />
      </section>
    </div>
  );
}
