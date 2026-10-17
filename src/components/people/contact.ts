/**
 * Contact links derived from a person's fields (pure; unit-tested in contact.test.ts):
 * the Message menu on the profile and the Details rows both read these.
 */
export type ContactKind = "sms" | "call" | "whatsapp" | "email" | "linkedin" | "x" | "instagram" | "website";

export type ContactLink = { kind: ContactKind; label: string; value: string; href: string; external: boolean };

type Fields = { phone?: string | null; email?: string | null; linkedin?: string | null; xHandle?: string | null; instagram?: string | null; website?: string | null };

const trim = (s: string | null | undefined) => (s ?? "").trim();
const handleOf = (s: string) =>
  s
    .replace(/^(https?:\/\/)?(www\.)?(x|twitter|instagram)\.com\//i, "")
    .replace(/^@+/, "")
    .replace(/[/?#].*$/, "");
const withScheme = (s: string) => (/^https?:\/\//i.test(s) ? s : `https://${s}`);
const bare = (s: string) => s.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");

/** Digits (and a leading +) for tel:/sms:; WhatsApp wants digits only. */
export function dialable(phone: string): string {
  const t = phone.trim();
  return (t.startsWith("+") ? "+" : "") + t.replace(/\D/g, "");
}

export function linkedinUrl(v: string): string {
  const t = v.trim();
  if (/linkedin\.com/i.test(t)) return withScheme(t);
  return `https://www.linkedin.com/in/${t.replace(/^@+/, "").replace(/^\/+|\/+$/g, "")}`;
}

/** Every way to reach someone, in Message-menu order. */
export function contactLinks(p: Fields): ContactLink[] {
  const out: ContactLink[] = [];
  const phone = trim(p.phone);
  if (phone && dialable(phone).replace("+", "").length >= 3) {
    const n = dialable(phone);
    out.push({ kind: "sms", label: "Message", value: phone, href: `sms:${n}`, external: false });
    out.push({ kind: "call", label: "Call", value: phone, href: `tel:${n}`, external: false });
    out.push({ kind: "whatsapp", label: "WhatsApp", value: phone, href: `https://wa.me/${n.replace("+", "")}`, external: true });
  }
  const email = trim(p.email);
  if (email) out.push({ kind: "email", label: "Email", value: email, href: `mailto:${email}`, external: false });
  const li = trim(p.linkedin);
  if (li) out.push({ kind: "linkedin", label: "LinkedIn", value: bare(li).replace(/^linkedin\.com\/in\//i, ""), href: linkedinUrl(li), external: true });
  const x = trim(p.xHandle);
  if (x && handleOf(x)) out.push({ kind: "x", label: "X", value: `@${handleOf(x)}`, href: `https://x.com/${handleOf(x)}`, external: true });
  const ig = trim(p.instagram);
  if (ig && handleOf(ig)) out.push({ kind: "instagram", label: "Instagram", value: `@${handleOf(ig)}`, href: `https://instagram.com/${handleOf(ig)}`, external: true });
  const web = trim(p.website);
  if (web) out.push({ kind: "website", label: "Website", value: bare(web), href: withScheme(web), external: true });
  return out;
}

/**
 * Their UTC offset minus ours, in minutes (null for unknown zones). Uses Intl only, so it follows
 * DST on both sides.
 */
export function offsetDiffMinutes(timeZone: string | null | undefined, now: number): number | null {
  if (!timeZone) return null;
  try {
    const d = new Date(now);
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" }).formatToParts(d);
    const get = (t: Intl.DateTimeFormatPartTypes) => Number(parts.find((x) => x.type === t)?.value ?? 0);
    const theirs = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
    const utcMinute = Math.floor(d.getTime() / 60_000) * 60_000;
    const theirOffset = Math.round((theirs - utcMinute) / 60_000);
    const ourOffset = -d.getTimezoneOffset();
    return theirOffset - ourOffset;
  } catch {
    return null;
  }
}

/** "2h ahead", "5h 30m behind" — null when it's the same time. */
export function offsetLabel(diffMinutes: number | null): string | null {
  if (!diffMinutes) return null;
  const abs = Math.abs(diffMinutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const amount = h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
  return `${amount} ${diffMinutes > 0 ? "ahead" : "behind"}`;
}
