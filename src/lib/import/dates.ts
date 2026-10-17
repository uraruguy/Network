/** Date rules for imported notes. All dates are calendar dates (YYYY-MM-DD) interpreted at noon UTC. */

const DAY = 86_400_000;

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Noon UTC of a YYYY-MM-DD string (stable across time zones), or null. */
export function fromIsoDay(s: string | null | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return isoDay(d) === s ? d : null; // rejects 2026-02-31
}

/** dd.mm.yyyy / d.m.yy / dd. mm. yyyy anywhere in a title → Date (noon UTC). */
export function dateFromTitle(title: string | null | undefined): Date | null {
  if (!title) return null;
  const m = title.match(/(?<!\d)(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4}|\d{2})(?!\d)/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (m[3]!.length === 2) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000 || year > 2100) return null;
  return fromIsoDay(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
}

export type NoteDateSource = "title" | "extracted" | "created" | "now";

/**
 * The date a note is about:
 *  1. a dd.mm.yyyy date in the title wins;
 *  2. else the extracted occurredAt when it lies within [created − 2 years, created + 30 days];
 *  3. else the note's creation date.
 */
export function noteDate(input: { title: string | null; occurredAt?: string | null; created: Date | null }, now = new Date()): { date: Date; source: NoteDateSource } {
  const t = dateFromTitle(input.title);
  if (t) return { date: t, source: "title" };
  const occ = fromIsoDay(input.occurredAt ?? null);
  if (occ) {
    const base = input.created ?? now;
    if (occ.getTime() >= base.getTime() - 730 * DAY && occ.getTime() <= base.getTime() + 30 * DAY) return { date: occ, source: "extracted" };
  }
  if (input.created) return { date: input.created, source: "created" };
  return { date: now, source: "now" };
}

const SI_MONTHS: Record<string, number> = {
  jan: 1, januar: 1, januarja: 1, january: 1,
  feb: 2, februar: 2, februarja: 2, february: 2,
  mar: 3, marec: 3, marca: 3, march: 3,
  apr: 4, april: 4, aprila: 4,
  maj: 5, maja: 5, may: 5,
  jun: 6, junij: 6, junija: 6, june: 6,
  jul: 7, julij: 7, julija: 7, july: 7,
  avg: 8, avgust: 8, avgusta: 8, aug: 8, august: 8,
  sep: 9, september: 9, septembra: 9, sept: 9,
  okt: 10, oktober: 10, oktobra: 10, oct: 10, october: 10,
  nov: 11, november: 11, novembra: 11,
  dec: 12, december: 12, decembra: 12,
};
const WEEKDAYS: Record<string, number> = {
  nedelja: 0, nedeljo: 0, sunday: 0,
  ponedeljek: 1, monday: 1,
  torek: 2, tuesday: 2,
  sreda: 3, sredo: 3, wednesday: 3,
  cetrtek: 4, četrtek: 4, thursday: 4,
  petek: 5, friday: 5,
  sobota: 6, soboto: 6, saturday: 6,
};

/**
 * Resolves a follow-up's "when" against the note date. Handles ISO dates, dd.mm.(yyyy),
 * "čez 2 tedna" / "in 2 weeks", "naslednji teden" / "next week", "jutri" / "tomorrow",
 * weekday names and month names. Returns null when no date can be derived.
 */
export function resolveWhen(when: string | null | undefined, base: Date): Date | null {
  if (!when) return null;
  const w = when.trim().toLowerCase();
  const iso = w.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return fromIsoDay(iso[1]);
  const dm = w.match(/(?<!\d)(\d{1,2})\.\s?(\d{1,2})\.(?:\s?(\d{4}|\d{2}))?/);
  if (dm) {
    const day = Number(dm[1]);
    const month = Number(dm[2]);
    let year = dm[3] ? Number(dm[3]) : base.getUTCFullYear();
    if (dm[3]?.length === 2) year += 2000;
    let d = fromIsoDay(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    if (d && !dm[3] && d.getTime() < base.getTime() - 7 * DAY) d = fromIsoDay(`${year + 1}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    if (d) return d;
  }
  const b = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 12));
  const addDays = (n: number) => new Date(b.getTime() + n * DAY);
  const num = w.match(/(\d+|en|eno|enega|dva|dve|tri|štiri|stiri|pet|one|two|three|four|five|a|an)\s*(dan|dni|dneva|day|days|ted|tedn|tedna|tedne|teden|tednov|week|weeks|mesec|mesca|mesece|mesecev|month|months|let|leto|leti|year|years)/);
  if (num) {
    const words: Record<string, number> = { en: 1, eno: 1, enega: 1, dva: 2, dve: 2, tri: 3, štiri: 4, stiri: 4, pet: 5, one: 1, two: 2, three: 3, four: 4, five: 5, a: 1, an: 1 };
    const n = /^\d+$/.test(num[1]!) ? Number(num[1]) : (words[num[1]!] ?? 1);
    const u = num[2]!;
    if (/^(dan|dni|dneva|day)/.test(u)) return addDays(n);
    if (/^(ted|week)/.test(u)) return addDays(7 * n);
    if (/^(mes|month)/.test(u)) return new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + n, b.getUTCDate(), 12));
    return new Date(Date.UTC(b.getUTCFullYear() + n, b.getUTCMonth(), b.getUTCDate(), 12));
  }
  if (/\b(jutri|tomorrow)\b/.test(w)) return addDays(1);
  if (/\b(pojutrišnjem|pojutrisnjem)\b/.test(w)) return addDays(2);
  if (/(naslednji|naslednjem|drug|next)\s+(teden|tednu|week)/.test(w)) return addDays(7);
  if (/(naslednji|naslednjem|drug|next)\s+(mesec|mesecu|month)/.test(w)) return new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + 1, b.getUTCDate(), 12));
  for (const [name, wd] of Object.entries(WEEKDAYS)) {
    if (new RegExp(`\\b${name}\\b`).test(w)) {
      const delta = ((wd - b.getUTCDay() + 7) % 7) || 7;
      return addDays(delta);
    }
  }
  for (const [name, mo] of Object.entries(SI_MONTHS)) {
    if (new RegExp(`\\b${name}\\b`).test(w)) {
      let y = b.getUTCFullYear();
      if (mo - 1 < b.getUTCMonth()) y++;
      return new Date(Date.UTC(y, mo - 1, 1, 12));
    }
  }
  return null;
}
