import type { ReminderWithPerson } from "@/lib/data/reminders";
import { actionUrl } from "@/lib/signing";

export type DigestBirthday = { id: string; displayName: string; birthday: string; inDays: number; /** Age they turn (null when the year is unknown). */ turning?: number | null };
type Birthday = DigestBirthday;

export type DigestParts = { base: string; name: string; dateLabel: string; due: ReminderWithPerson[]; overdue: ReminderWithPerson[]; birthdays: Birthday[] };

const when = (inDays: number) => (inDays === 0 ? "today" : inDays === 1 ? "tomorrow" : `in ${inDays} days`);
const birthdayLine = (b: Birthday) => (b.turning ? `turns ${b.turning} ${when(b.inDays)}` : `birthday ${when(b.inDays)}`);

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function digestSubject(due: ReminderWithPerson[], birthdays: Birthday[]) {
  const names = due.slice(0, 3).map((r) => r.person.displayName.split(" ")[0]);
  const more = due.length > 3 ? ` +${due.length - 3}` : "";
  if (due.length) return `Follow up today: ${names.join(", ")}${more}`;
  if (birthdays.length) return `Birthday soon: ${birthdays[0]!.displayName}`;
  return "The Network — today";
}

export function digestHtml(opts: DigestParts) {
  const { base, name, dateLabel, due, overdue, birthdays } = opts;
  const row = (r: ReminderWithPerson, late: boolean) => `
    <tr><td style="padding:14px 0;border-top:1px solid rgba(11,36,38,0.08)">
      <div style="font:600 16px -apple-system,BlinkMacSystemFont,'SF Pro Text',Helvetica,Arial,sans-serif;color:#0b2426">
        <a href="${base}/people/${r.person.id}" style="color:#0b2426;text-decoration:none">${esc(r.person.displayName)}</a>
        ${late ? '<span style="font:500 11px -apple-system,sans-serif;color:#e5484d;margin-left:6px">overdue</span>' : ""}
      </div>
      <div style="font:400 14px -apple-system,sans-serif;color:#3f5a5c;margin-top:2px">${esc(r.message ?? "Check in")}${r.person.headline || r.person.company ? ` · <span style="color:#7a9295">${esc([r.person.headline, r.person.company].filter(Boolean).join(", "))}</span>` : ""}</div>
      <div style="margin-top:10px">
        <a href="${actionUrl(base, r.id, "done")}" style="display:inline-block;font:600 13px -apple-system,sans-serif;color:#fff;background:#0fb5ba;padding:8px 14px;border-radius:999px;text-decoration:none">Done ✓</a>
        <a href="${actionUrl(base, r.id, "snooze")}" style="display:inline-block;font:600 13px -apple-system,sans-serif;color:#0a949a;background:#e6f8f8;padding:8px 14px;border-radius:999px;text-decoration:none;margin-left:6px">Snooze a week</a>
        <a href="${base}/people/${r.person.id}" style="display:inline-block;font:500 13px -apple-system,sans-serif;color:#3f5a5c;padding:8px 10px;text-decoration:none">Open →</a>
      </div>
    </td></tr>`;

  const section = (title: string, rows: string) => rows ? `<tr><td style="padding:22px 0 6px;font:600 12px -apple-system,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#7a9295">${title}</td></tr>${rows}` : "";

  const bday = birthdays.map((b) => `<tr><td style="padding:10px 0;border-top:1px solid rgba(11,36,38,0.08);font:400 14px -apple-system,sans-serif;color:#0b2426">🎂 <a href="${base}/people/${b.id}" style="color:#0b2426;font-weight:600;text-decoration:none">${esc(b.displayName)}</a> <span style="color:#3f5a5c">${birthdayLine(b)}</span></td></tr>`).join("");

  return `<!doctype html><html><body style="margin:0;background:#f4fbfb;padding:24px 12px">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
  <table role="presentation" width="100%" style="max-width:520px;background:rgba(255,255,255,0.85);border:1px solid rgba(11,36,38,0.08);border-radius:24px;padding:28px 26px" cellspacing="0" cellpadding="0">
    <tr><td>
      <div style="font:700 22px -apple-system,BlinkMacSystemFont,'SF Pro Display',Helvetica,Arial,sans-serif;letter-spacing:-0.02em;color:#0b2426">Good morning, ${esc(name)}</div>
      <div style="font:400 14px -apple-system,sans-serif;color:#3f5a5c;margin-top:4px">${esc(dateLabel)} · ${due.length + overdue.length} to follow up${birthdays.length ? ` · ${birthdays.length} birthday${birthdays.length > 1 ? "s" : ""}` : ""}</div>
    </td></tr>
    ${section("Overdue", overdue.map((r) => row(r, true)).join(""))}
    ${section("Today", due.map((r) => row(r, false)).join(""))}
    ${section("Birthdays this week", bday)}
    <tr><td style="padding-top:24px;font:400 12px -apple-system,sans-serif;color:#a9bcbe">Sent by <a href="${base}/today" style="color:#0a949a;text-decoration:none">The Network</a>. Change the time or turn this off in <a href="${base}/settings/digest" style="color:#0a949a;text-decoration:none">Settings</a>.</td></tr>
  </table></td></tr></table></body></html>`;
}

/** The plain-text part of the digest (same content, readable in any client). */
export function digestText({ base, name, dateLabel, due, overdue, birthdays }: DigestParts): string {
  const lines: string[] = [`Good morning, ${name}`, `${dateLabel} · ${due.length + overdue.length} to follow up${birthdays.length ? ` · ${birthdays.length} birthday${birthdays.length > 1 ? "s" : ""}` : ""}`, ""];
  const item = (r: ReminderWithPerson) => {
    const who = [r.person.headline, r.person.company].filter(Boolean).join(", ");
    return [
      `• ${r.person.displayName}${who ? ` (${who})` : ""} — ${r.message ?? "Check in"}`,
      `  Done: ${actionUrl(base, r.id, "done")}`,
      `  Snooze a week: ${actionUrl(base, r.id, "snooze")}`,
      `  Open: ${base}/people/${r.person.id}`,
    ].join("\n");
  };
  if (overdue.length) lines.push("OVERDUE", ...overdue.map(item), "");
  if (due.length) lines.push("TODAY", ...due.map(item), "");
  if (birthdays.length) lines.push("BIRTHDAYS THIS WEEK", ...birthdays.map((b) => `• ${b.displayName} — ${birthdayLine(b)}`), "");
  lines.push(`Sent by The Network (${base}/today). Change the time or turn this off in Settings: ${base}/settings/digest`);
  return lines.join("\n");
}
