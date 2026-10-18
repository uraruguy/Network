import "server-only";
import { Resend } from "resend";
import { htmlToText } from "./text";
import type { EmailTransport } from "./types";

/** Resend (resend.com) transport — an API key and a verified sender domain (or onboarding@resend.dev). */
export function createResendTransport({ apiKey, from }: { apiKey: string; from: string }): EmailTransport {
  const client = new Resend(apiKey);
  return {
    provider: "resend",
    from,
    async send({ to, subject, html, text, replyTo }) {
      const { data, error } = await client.emails.send({ from, to, subject, html, text: text ?? htmlToText(html), ...(replyTo ? { replyTo } : {}) });
      if (error) throw new Error(error.message);
      return { id: data?.id ?? null };
    },
  };
}
