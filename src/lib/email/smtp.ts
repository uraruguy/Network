import "server-only";
import nodemailer from "nodemailer";
import type { SmtpSettings } from "@/lib/connections/email";
import { htmlToText } from "./text";
import type { EmailTransport } from "./types";

/** nodemailer options for SMTP settings: a URL (env SMTP_URL) or host/port/secure/user/pass. Pure. */
export function smtpOptions(s: SmtpSettings) {
  const timeouts = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 };
  if (s.url) return { url: s.url, ...timeouts };
  const secure = s.secure ?? s.port === 465;
  return {
    host: s.host,
    port: s.port ?? (secure ? 465 : 587),
    secure,
    ...(s.user ? { auth: { user: s.user, pass: s.pass ?? "" } } : {}),
    ...timeouts,
  };
}

/** SMTP transport (any mail provider, or a local catcher like Mailpit). */
export function createSmtpTransport({ smtp, from }: { smtp: SmtpSettings; from: string }): EmailTransport {
  const transporter = nodemailer.createTransport(smtpOptions(smtp));
  return {
    provider: "smtp",
    from,
    async send({ to, subject, html, text, replyTo }) {
      const info = await transporter.sendMail({ from, to, subject, html, text: text ?? htmlToText(html), ...(replyTo ? { replyTo } : {}) });
      return { id: info.messageId ?? null };
    },
  };
}
