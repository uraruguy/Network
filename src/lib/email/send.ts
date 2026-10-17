import "server-only";
import { emailConfigFromEnv } from "@/lib/connections/email";
import { getEmailTransport } from "./index";

/**
 * @deprecated v1 helpers, kept for compatibility. Use `getEmailTransport()` from `@/lib/email`
 * (Resend or SMTP, configured from the environment or Settings → Connections).
 */

/** @deprecated Only sees environment configuration; use `getEmailTransport()` (null = not configured). */
export function emailConfigured() {
  return emailConfigFromEnv() !== null;
}

/** @deprecated Use `(await getEmailTransport())?.send(…)`. Throws when e-mail isn't configured. */
export async function sendEmail(opts: { to: string; subject: string; html: string; text?: string }) {
  const transport = await getEmailTransport();
  if (!transport) throw new Error("E-mail is not configured (Settings → Connections, or RESEND_API_KEY / SMTP_URL)");
  const { id } = await transport.send(opts);
  return id ?? undefined;
}
