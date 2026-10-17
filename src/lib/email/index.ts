import "server-only";
import { getEmailConfig, type EmailConfig } from "@/lib/connections/email";
import { createResendTransport } from "./resend";
import { createSmtpTransport } from "./smtp";
import type { EmailTransport } from "./types";

/**
 * Sending e-mail. One interface over Resend and SMTP, configured from the environment or
 * Settings → Connections (env wins):
 *
 *   const mail = await getEmailTransport();
 *   if (!mail) return "e-mail not configured";
 *   await mail.send({ to, subject, html });   // a text part is derived from html when omitted
 */

export type { EmailMessage, EmailProvider, EmailTransport } from "./types";
export { htmlToText } from "./text";

/** The transport for a resolved configuration, or null when sending is off. */
export function transportFor(config: EmailConfig): EmailTransport | null {
  if (config.provider === "resend") return createResendTransport({ apiKey: config.apiKey, from: config.from });
  if (config.provider === "smtp") return createSmtpTransport({ smtp: config.smtp, from: config.from });
  return null;
}

/** The active transport (env → stored connection), or null when e-mail isn't configured. */
export async function getEmailTransport(ownerId?: string): Promise<EmailTransport | null> {
  return transportFor(await getEmailConfig(ownerId));
}
