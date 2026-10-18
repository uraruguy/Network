import "server-only";
import { transportFor } from "@/lib/email";
import { emailFingerprint, getEmailConfig, type EmailConfig } from "./email";
import { clearConnectionCache, recordCheck } from "./store";

export type EmailTestResult = { ok: boolean; to: string; latencyMs?: number; provider: EmailConfig["provider"]; source: EmailConfig["source"]; id?: string | null; error?: string };

/** Short, safe error text from a transport failure. */
export function describeEmailError(err: unknown): string {
  const e = err as { code?: string; responseCode?: number; message?: string };
  if (e?.code === "EAUTH") return "The SMTP server rejected the username or password.";
  if (e?.code === "ECONNREFUSED") return "Couldn't connect to the SMTP server (connection refused). Check host and port.";
  if (e?.code === "ETIMEDOUT" || e?.code === "ESOCKET") return "The SMTP server didn't respond in time. Check host, port and the TLS setting.";
  if (e?.code === "EDNS" || e?.code === "ENOTFOUND") return "The SMTP host name couldn't be resolved.";
  return (e?.message ?? "Sending failed").replace(/(re|sk)[-_][\w-]{8,}/g, "$1_…").slice(0, 300);
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Sends a short test message to `to` (the owner) and records the result on the connection. */
export async function testEmailConnection(ownerId: string, to: string, appUrl: string): Promise<EmailTestResult> {
  clearConnectionCache();
  const config = await getEmailConfig(ownerId);
  const base = { to, provider: config.provider, source: config.source };
  const transport = transportFor(config);
  if (!transport) return { ...base, ok: false, error: "E-mail is turned off." };
  const via = config.provider === "smtp" ? "SMTP" : "Resend";
  const started = performance.now();
  let result: EmailTestResult;
  try {
    const { id } = await transport.send({
      to,
      subject: "The Network — test e-mail",
      html: `<!doctype html><html><body style="margin:0;padding:24px 12px;background:#f4fbfb"><table role="presentation" width="100%"><tr><td align="center"><table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:20px;padding:24px;font:400 15px -apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;color:#0b2426"><tr><td><div style="font-weight:700;font-size:20px">It works ✓</div><p style="color:#3f5a5c">This is a test from The Network, sent via ${via} from <b>${escape(config.from)}</b>. Daily digests will arrive the same way.</p><p><a href="${escape(appUrl)}/settings/connections" style="color:#0a949a">Open Settings</a></p></td></tr></table></td></tr></table></body></html>`,
    });
    result = { ...base, ok: true, id, latencyMs: Math.round(performance.now() - started) };
  } catch (err) {
    result = { ...base, ok: false, latencyMs: Math.round(performance.now() - started), error: describeEmailError(err) };
  }
  await recordCheck(ownerId, "email", config.provider, { ok: result.ok, source: config.source, fingerprint: emailFingerprint(config), latencyMs: result.latencyMs, error: result.error });
  return result;
}
