/**
 * Pure helpers behind the Today screen (no React) — unit-tested in today-data.test.ts.
 */
import type { Warmth } from "@/lib/constants";

const DAY = 86_400_000;

/** "Good morning" … by local hour. */
export function greeting(now: number | Date, name?: string | null): string {
  const h = new Date(now).getHours();
  const g = h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const first = name?.trim().split(/\s+/)[0];
  return first ? `${g}, ${first}` : g;
}

export function startOfDay(t: number | Date): Date {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(t: number | Date): Date {
  const d = new Date(t);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Local calendar day as yyyy-mm-dd (stable query keys within a day). */
export function dayKey(t: number | Date): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Horizon of the "This week" list: the end of the 7th day after today. */
export function weekHorizon(now: number | Date): Date {
  const d = endOfDay(now);
  d.setDate(d.getDate() + 7);
  return d;
}

type Dated = { dueAt: string | Date };

/** Splits open reminders into due (overdue + today) and the rest of the coming week. */
export function splitReminders<T extends Dated>(rows: readonly T[], now: number | Date): { due: T[]; week: T[]; overdue: number } {
  const today = startOfDay(now).getTime();
  const tonight = endOfDay(now).getTime();
  const horizon = weekHorizon(now).getTime();
  const due: T[] = [];
  const week: T[] = [];
  let overdue = 0;
  for (const r of rows) {
    const t = new Date(r.dueAt).getTime();
    if (t <= tonight) {
      due.push(r);
      if (t < today) overdue++;
    } else if (t <= horizon) week.push(r);
  }
  return { due, week, overdue };
}

export type StatCounts = { overdue: number; dueToday: number; upcoming7d: number };

/**
 * The Today tiles after completing (-1) or un-completing (+1) one open follow-up: the counter
 * its due date falls in (overdue · due today · the next 7 days, as /api/stats counts them), and
 * nothing for later ones.
 */
export function bumpStats<T extends StatCounts>(stats: T, dueAt: string | Date, now: number | Date, delta: number): T {
  const t = new Date(dueAt).getTime();
  const field: keyof StatCounts | null =
    t < startOfDay(now).getTime() ? "overdue" : t <= endOfDay(now).getTime() ? "dueToday" : t <= weekHorizon(now).getTime() ? "upcoming7d" : null;
  return field ? { ...stats, [field]: Math.max(0, stats[field] + delta) } : stats;
}

/** Whole days between a due date and today's midnight (positive = overdue). */
export function daysOverdue(dueAt: string | Date, now: number | Date): number {
  return Math.round((startOfDay(now).getTime() - startOfDay(new Date(dueAt)).getTime()) / DAY);
}

/* ---------- Reconnect ---------- */

export const RECONNECT_AFTER_DAYS = 60;
const RECONNECT_WARMTH: readonly Warmth[] = ["inner", "active"];

type IndexLike = { id: string; warmth: Warmth; lastInteractionAt: string | Date | null };

/**
 * Inner-circle and active people without an interaction for 60+ days: inner first, then the
 * longest silence; people never logged come after everyone with a date.
 */
export function reconnectCandidates<T extends IndexLike>(rows: readonly T[], now: number | Date, limit = 12): T[] {
  const cutoff = new Date(now).getTime() - RECONNECT_AFTER_DAYS * DAY;
  const last = (p: T) => (p.lastInteractionAt ? new Date(p.lastInteractionAt).getTime() : null);
  return rows
    .filter((p) => RECONNECT_WARMTH.includes(p.warmth) && (last(p) ?? -Infinity) < cutoff)
    .sort((a, b) => {
      if (a.warmth !== b.warmth) return a.warmth === "inner" ? -1 : 1;
      const la = last(a);
      const lb = last(b);
      if (la === null || lb === null) return la === null ? (lb === null ? 0 : 1) : -1;
      return la - lb;
    })
    .slice(0, limit);
}

/** Compact silence label: "9 wk", "3 mo", "1 yr", or null when never logged. */
export function silenceLabel(lastInteractionAt: string | Date | null, now: number | Date): string | null {
  if (!lastInteractionAt) return null;
  const days = Math.max(0, Math.floor((new Date(now).getTime() - new Date(lastInteractionAt).getTime()) / DAY));
  if (days < 7) return `${days} d`;
  if (days < 63) return `${Math.floor(days / 7)} wk`;
  if (days < 365) return `${Math.floor(days / 30.44)} mo`;
  return `${Math.floor(days / 365.25)} yr`;
}
