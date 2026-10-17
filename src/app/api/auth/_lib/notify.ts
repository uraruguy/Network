import "server-only";
import { after } from "next/server";
import { clientEnv } from "@/lib/env";
import { emailConfigured, sendEmail } from "@/lib/email/send";

/**
 * Security notifications ("a new passkey was added", "a recovery code was used"). Best effort:
 * sent after the response, skipped when e-mail isn't configured, failures only logged — a mail
 * outage must never block signing in.
 */

export type SecurityEvent = { kind: "passkey_added"; name: string | null } | { kind: "recovery_code_used"; remaining: number };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Rough "Safari on iPhone" from a User-Agent, for the e-mail only. */
export function describeDevice(ua: string | null): string {
  if (!ua) return "an unknown device";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Macintosh/.test(ua) ? "Mac" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : null;
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : null;
  if (os && browser) return `${browser} on ${os}`;
  return os ?? browser ?? "an unknown device";
}

function render(event: SecurityEvent, device: string, when: string) {
  const base = clientEnv.NEXT_PUBLIC_APP_URL;
  const what =
    event.kind === "passkey_added"
      ? { subject: "New passkey added to The Network", line: `A new passkey${event.name ? ` (“${esc(event.name)}”)` : ""} was added from ${esc(device)} on ${esc(when)}.` }
      : { subject: "A recovery code was used", line: `A recovery code was used to sign in from ${esc(device)} on ${esc(when)}. ${event.remaining} code${event.remaining === 1 ? "" : "s"} left.` };
  const html = `<!doctype html><html><body style="margin:0;background:#f4fbfb;padding:24px 12px">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
  <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border:1px solid rgba(11,36,38,0.08);border-radius:24px;padding:28px 26px" cellspacing="0" cellpadding="0"><tr><td>
    <div style="font:700 20px -apple-system,BlinkMacSystemFont,'SF Pro Display',Helvetica,Arial,sans-serif;color:#0b2426">${what.subject}</div>
    <p style="font:400 15px/1.5 -apple-system,sans-serif;color:#3f5a5c;margin:12px 0 0">${what.line}</p>
    <p style="font:400 15px/1.5 -apple-system,sans-serif;color:#3f5a5c;margin:12px 0 0">If this was you, there's nothing to do. If not, change your password and review your passkeys in <a href="${base}/settings" style="color:#0a949a">Settings → Security</a>.</p>
  </td></tr></table></td></tr></table></body></html>`;
  return { subject: what.subject, html };
}

export function notifySecurityEvent(to: string | null, event: SecurityEvent, userAgent: string | null) {
  if (!to) return;
  const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date()) + " UTC";
  const device = describeDevice(userAgent);
  after(async () => {
    try {
      if (!emailConfigured()) return;
      const { subject, html } = render(event, device, when);
      await sendEmail({ to, subject, html });
    } catch (err) {
      console.error("security e-mail failed", err instanceof Error ? err.message : err);
    }
  });
}
