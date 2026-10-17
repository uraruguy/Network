"use client";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Select } from "../Select";

/**
 * Birthdays are stored as a `date` ("yyyy-MM-dd"). An unknown year uses the sentinel year
 * 1604 — the same convention Apple Contacts uses — and is a leap year, so 29 Feb survives.
 */
export const NO_YEAR = 1604;

export type BirthdayParts = { day: number; month: number; year: number | null };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function parseBirthday(value: string | null | undefined): BirthdayParts | null {
  const m = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!m) return null;
  const year = Number(m[1]);
  return { day: Number(m[3]), month: Number(m[2]), year: year === NO_YEAR ? null : year };
}

export function serializeBirthday({ day, month, year }: BirthdayParts): string {
  return `${String(year ?? NO_YEAR).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** "14 October" or "14 October 1990". */
export function formatBirthday(value: string | null | undefined): string {
  const p = parseBirthday(value);
  if (!p) return "";
  return `${p.day} ${MONTHS[p.month - 1]}${p.year ? ` ${p.year}` : ""}`;
}

const daysIn = (month: number, year: number | null) => new Date(year ?? NO_YEAR, month, 0).getDate();

export type BirthdayPickerProps = {
  /** "yyyy-MM-dd" (year 1604 = unknown) or null. */
  value: string | null;
  onChange: (value: string | null) => void;
  /** Earliest selectable year. Default 1920. */
  minYear?: number;
  className?: string;
};

/** Day + month, optional year. Emits a full date only once day and month are both chosen. */
export function BirthdayPicker({ value, onChange, minYear = 1920, className }: BirthdayPickerProps) {
  const parts = parseBirthday(value);
  // Partial selection (day without month, …) stays local until it forms a date.
  const [draft, setDraft] = useState<Partial<BirthdayParts>>({});
  const cur: Partial<BirthdayParts> = parts ?? draft;
  const thisYear = new Date().getFullYear();
  const monthOptions = useMemo(() => MONTHS.map((label, i) => ({ value: String(i + 1), label })), []);
  const yearOptions = useMemo(
    () => [{ value: "none", label: "No year" }, ...Array.from({ length: thisYear - minYear + 1 }, (_, i) => ({ value: String(thisYear - i), label: String(thisYear - i) }))],
    [thisYear, minYear],
  );
  const maxDay = cur.month ? daysIn(cur.month, cur.year ?? null) : 31;
  const dayOptions = useMemo(() => Array.from({ length: maxDay }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })), [maxDay]);

  const update = (patch: Partial<BirthdayParts>) => {
    const next = { ...cur, ...patch };
    if (next.day && next.month) {
      const day = Math.min(next.day, daysIn(next.month, next.year ?? null));
      setDraft({});
      onChange(serializeBirthday({ day, month: next.month, year: next.year ?? null }));
    } else setDraft(next);
  };

  return (
    <div className={cn("grid grid-cols-[76px_minmax(0,1fr)_116px] gap-2", className)}>
      <Select className="gap-1.5 px-3" aria-label="Day" placeholder="Day" value={cur.day ? String(cur.day) : null} options={dayOptions} onChange={(d) => update({ day: Number(d) })} />
      <Select className="gap-1.5 px-3" aria-label="Month" placeholder="Month" value={cur.month ? String(cur.month) : null} options={monthOptions} onChange={(m) => update({ month: Number(m) })} />
      <Select
        className="gap-1.5 px-3"
        aria-label="Year"
        placeholder="Year"
        value={cur.year ? String(cur.year) : cur.year === null ? "none" : null}
        options={yearOptions}
        onChange={(y) => update({ year: y === "none" ? null : Number(y) })}
      />
    </div>
  );
}
