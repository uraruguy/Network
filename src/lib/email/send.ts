import { Resend } from "resend";
import { serverEnv } from "@/lib/env";

export function emailConfigured() {
  return !!serverEnv().RESEND_API_KEY;
}

export async function sendEmail(opts: { to: string; subject: string; html: string }) {
  const env = serverEnv();
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set");
  const resend = new Resend(env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({ from: env.EMAIL_FROM, to: opts.to, subject: opts.subject, html: opts.html });
  if (error) throw new Error(error.message);
  return data?.id;
}
