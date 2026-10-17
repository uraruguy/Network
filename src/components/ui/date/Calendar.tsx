"use client";
import {
  addDays,
  addMonths,
  addYears,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useNow } from "@/lib/clock";
import { cn } from "@/lib/utils";
import { IconButton } from "../IconButton";
import { WEEK_STARTS_ON } from "./presets";

export type CalendarProps = {
  value: Date | null;
  onChange: (date: Date) => void;
  /** Controlled visible month (any day within it). */
  month?: Date;
  onMonthChange?: (month: Date) => void;
  min?: Date | null;
  max?: Date | null;
  className?: string;
};

const WEEKDAYS = Array.from({ length: 7 }, (_, i) => format(addDays(startOfWeek(new Date(2026, 0, 5), { weekStartsOn: WEEK_STARTS_ON }), i), "EEEEE"));
const WEEKDAY_NAMES = Array.from({ length: 7 }, (_, i) => format(addDays(startOfWeek(new Date(2026, 0, 5), { weekStartsOn: WEEK_STARTS_ON }), i), "EEEE"));

/**
 * Month calendar (Monday first). ARIA grid with roving focus: arrows move by day/week,
 * Home/End to week edges, PageUp/PageDown by month (+Shift: year), Enter/Space selects.
 * Swipe horizontally (touch) or use the chevrons to change month. Always 6 rows → no jump.
 */
export function Calendar({ value, onChange, month: monthProp, onMonthChange, min, max, className }: CalendarProps) {
  const now = useNow();
  const today = startOfDay(new Date(now));
  const minDay = min ? startOfDay(min) : null;
  const maxDay = max ? startOfDay(max) : null;
  const [innerMonth, setInnerMonth] = useState(() => startOfMonth(value ?? today));
  const month = monthProp ? startOfMonth(monthProp) : innerMonth;
  const [focused, setFocused] = useState<Date>(() => value ?? today);
  const [dir, setDir] = useState<"next" | "prev" | null>(null);
  const keyboardNav = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const labelId = useId();

  const setMonth = (m: Date) => {
    const next = startOfMonth(m);
    setDir(isAfter(next, month) ? "next" : isBefore(next, month) ? "prev" : null);
    if (!monthProp) setInnerMonth(next);
    onMonthChange?.(next);
  };

  const disabled = (d: Date) => (minDay !== null && isBefore(d, minDay)) || (maxDay !== null && isAfter(d, maxDay));
  const canPrev = !minDay || isAfter(startOfMonth(month), minDay);
  const canNext = !maxDay || isBefore(endOfMonth(month), maxDay);

  const weeks = useMemo(() => {
    const start = startOfWeek(month, { weekStartsOn: WEEK_STARTS_ON });
    return Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
  }, [month]);

  // Roving focus target: keep it inside the visible month.
  const focusTarget = isSameMonth(focused, month)
    ? focused
    : value && isSameMonth(value, month)
      ? value
      : isSameMonth(today, month)
        ? today
        : month;

  useEffect(() => {
    if (!keyboardNav.current) return;
    keyboardNav.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>('button[tabindex="0"]')?.focus();
  }, [focusTarget]);

  const moveFocus = (d: Date) => {
    keyboardNav.current = true;
    setFocused(d);
    if (!isSameMonth(d, month)) setMonth(d);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, day: Date) => {
    const k = e.key;
    let next: Date | null = null;
    if (k === "ArrowLeft") next = addDays(day, -1);
    else if (k === "ArrowRight") next = addDays(day, 1);
    else if (k === "ArrowUp") next = addDays(day, -7);
    else if (k === "ArrowDown") next = addDays(day, 7);
    else if (k === "Home") next = startOfWeek(day, { weekStartsOn: WEEK_STARTS_ON });
    else if (k === "End") next = endOfWeek(day, { weekStartsOn: WEEK_STARTS_ON });
    else if (k === "PageUp") next = e.shiftKey ? addYears(day, -1) : addMonths(day, -1);
    else if (k === "PageDown") next = e.shiftKey ? addYears(day, 1) : addMonths(day, 1);
    if (!next) return;
    e.preventDefault();
    moveFocus(startOfDay(next));
  };

  // Horizontal swipe → month change (touch only; mouse drags are ignored).
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === "touch") swipe.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) < 48 || Math.abs(dy) > Math.abs(dx) * 0.7) return;
    if (dx < 0 && canNext) setMonth(addMonths(month, 1));
    if (dx > 0 && canPrev) setMonth(addMonths(month, -1));
  };

  return (
    <div className={cn("w-full min-w-[280px] select-none", className)}>
      <div className="mb-1 flex items-center justify-between pl-2">
        <h2 id={labelId} aria-live="polite" className="text-headline text-fg">
          {format(month, "LLLL yyyy")}
        </h2>
        <div className="flex items-center gap-1">
          <IconButton label="Previous month" variant="accent" size="md" icon={<ChevronLeft strokeWidth={2.4} />} disabled={!canPrev} onClick={() => setMonth(addMonths(month, -1))} />
          <IconButton label="Next month" variant="accent" size="md" icon={<ChevronRight strokeWidth={2.4} />} disabled={!canNext} onClick={() => setMonth(addMonths(month, 1))} />
        </div>
      </div>
      <div
        ref={gridRef}
        role="grid"
        aria-labelledby={labelId}
        className="touch-pan-y"
        data-base-ui-swipe-ignore="x"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (swipe.current = null)}
      >
        <div role="row" className="grid grid-cols-7">
          {WEEKDAYS.map((d, i) => (
            <div key={i} role="columnheader" aria-label={WEEKDAY_NAMES[i]} className="grid h-7 place-items-center text-caption2 font-semibold text-fg-3 uppercase">
              {d}
            </div>
          ))}
        </div>
        <div key={month.getTime()} data-dir={dir ?? undefined} className="ui-cal-month">
          {weeks.map((week, wi) => (
            <div role="row" key={wi} className="grid grid-cols-7">
              {week.map((day) => {
                const inMonth = isSameMonth(day, month);
                if (!inMonth)
                  return (
                    <div key={day.getTime()} role="gridcell" aria-hidden className="h-11">
                      <span className="sr-only" />
                    </div>
                  );
                const selected = !!value && isSameDay(day, value);
                const isToday = isSameDay(day, today);
                const off = disabled(day);
                const focusable = isSameDay(day, focusTarget);
                return (
                  <div key={day.getTime()} role="gridcell" aria-selected={selected} className="grid h-11 place-items-center">
                    <button
                      type="button"
                      tabIndex={focusable ? 0 : -1}
                      aria-label={format(day, "EEEE, d MMMM yyyy")}
                      aria-current={isToday ? "date" : undefined}
                      aria-disabled={off || undefined}
                      onClick={() => {
                        if (off) return;
                        setFocused(day);
                        onChange(day);
                      }}
                      onKeyDown={(e) => onKeyDown(e, day)}
                      onFocus={() => !isSameDay(day, focused) && setFocused(day)}
                      className={cn(
                        "grid size-10 place-items-center rounded-full text-body tabular-nums outline-offset-0 transition-[background-color,color,transform] duration-150 active:scale-95",
                        selected
                          ? "bg-accent-fill font-semibold text-accent-fg"
                          : isToday
                            ? "font-semibold text-accent-text hover:bg-accent-soft"
                            : "text-fg hover:bg-fill-1",
                        off && "pointer-events-none text-fg-4 opacity-60",
                      )}
                    >
                      {format(day, "d")}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
