/** One outgoing e-mail. A plain-text part is always sent (derived from `html` when omitted). */
export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

export type EmailProvider = "resend" | "smtp";

export interface EmailTransport {
  provider: EmailProvider;
  /** The From header used for every message. */
  from: string;
  /** Sends one message; resolves with the provider's message id (when it reports one). */
  send(message: EmailMessage): Promise<{ id: string | null }>;
}
