import "server-only";
import { secretHint } from "@/lib/crypto/secrets";
import { cached, envValue, fingerprint, loadConnection, saveConnection, statusFor, type ConnectionCheck, type ConnectionSource, type ConnectionStatus, type StoredConnection } from "./store";

/**
 * The e-mail connection: how the app sends mail (daily digest, test mails).
 *
 *   const email = await getEmailConfig();   // env first, then Settings → Connections, else "off"
 *   const transport = await getEmailTransport();   // src/lib/email — what you usually want
 *
 * Environment (read-only in the UI): SMTP_URL (smtp[s]://user:pass@host:port — wins over Resend),
 * RESEND_API_KEY, EMAIL_FROM.
 */

export const DEFAULT_EMAIL_FROM = "The Network <onboarding@resend.dev>";
export const EMAIL_ENV_VARS = ["SMTP_URL", "RESEND_API_KEY", "EMAIL_FROM"] as const;
export const UI_EMAIL_PROVIDERS = ["resend", "smtp", "off"] as const;
export type UiEmailProvider = (typeof UI_EMAIL_PROVIDERS)[number];

export type SmtpSettings = {
  /** Full connection URL (env `SMTP_URL`); when set, the fields below are ignored. */
  url?: string;
  host?: string;
  port?: number;
  /** TLS from the first byte (port 465). Otherwise STARTTLS is used when the server offers it. */
  secure?: boolean;
  user?: string;
  pass?: string;
};

type Source = { source: "env" | "db" };
export type EmailConfig =
  | ({ provider: "off"; from: string } & Source)
  | ({ provider: "resend"; from: string; apiKey: string } & Source)
  | ({ provider: "smtp"; from: string; smtp: SmtpSettings } & Source);

type Env = Record<string, string | undefined>;

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** E-mail settings from the environment, or null when it doesn't configure sending. Pure. */
export function emailConfigFromEnv(env: Env = process.env): EmailConfig | null {
  const from = envValue(env, "EMAIL_FROM") ?? DEFAULT_EMAIL_FROM;
  const smtpUrl = envValue(env, "SMTP_URL");
  if (smtpUrl) return { provider: "smtp", from, smtp: { url: smtpUrl }, source: "env" };
  const apiKey = envValue(env, "RESEND_API_KEY");
  if (apiKey) return { provider: "resend", from, apiKey, source: "env" };
  return null;
}

/** E-mail settings from a stored row; incomplete settings resolve to "off". Pure. */
export function emailConfigFromStored(row: Pick<StoredConnection, "provider" | "config" | "secret"> | null, env: Env = process.env): EmailConfig | null {
  if (!row) return null;
  const from = str(row.config.from) ?? envValue(env, "EMAIL_FROM") ?? DEFAULT_EMAIL_FROM;
  if (row.provider === "resend") {
    return row.secret ? { provider: "resend", from, apiKey: row.secret, source: "db" } : { provider: "off", from, source: "db" };
  }
  if (row.provider === "smtp") {
    const host = str(row.config.host);
    if (!host) return { provider: "off", from, source: "db" };
    const port = typeof row.config.port === "number" ? row.config.port : undefined;
    const user = str(row.config.user);
    return {
      provider: "smtp",
      from,
      smtp: { host, ...(port ? { port } : {}), secure: row.config.secure === true, ...(user ? { user } : {}), ...(row.secret ? { pass: row.secret } : {}) },
      source: "db",
    };
  }
  if (row.provider === "off") return { provider: "off", from, source: "db" };
  return null;
}

/** env → db → off. Pure. */
export function resolveEmailConfig(fromEnv: EmailConfig | null, fromDb: EmailConfig | null, env: Env = process.env): EmailConfig {
  return fromEnv ?? fromDb ?? { provider: "off", from: envValue(env, "EMAIL_FROM") ?? DEFAULT_EMAIL_FROM, source: "db" };
}

/** The active e-mail configuration (cached 60 s per instance, cleared on save). */
export function getEmailConfig(ownerId?: string): Promise<EmailConfig> {
  const fromEnv = emailConfigFromEnv();
  if (fromEnv) return Promise.resolve(fromEnv);
  return cached(`email:${ownerId ?? "*"}`, async () => resolveEmailConfig(null, emailConfigFromStored(await loadConnection("email", ownerId))));
}

export function emailFingerprint(c: EmailConfig): string {
  if (c.provider === "resend") return fingerprint(["email", c.source, "resend", c.from, c.apiKey]);
  if (c.provider === "smtp") return fingerprint(["email", c.source, "smtp", c.from, c.smtp.url, c.smtp.host, c.smtp.port, c.smtp.secure, c.smtp.user, c.smtp.pass]);
  return fingerprint(["email", c.source, "off"]);
}

/** `smtps://user:****@host:465` — for display. */
export function redactSmtpUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "****";
    return u.toString().replace(/\/$/, "");
  } catch {
    return "smtp://…";
  }
}

/* ---------- view (API) ---------- */

export type EmailConnectionView = {
  source: ConnectionSource;
  provider: EmailConfig["provider"];
  from: string;
  defaultFrom: string;
  storedProvider: UiEmailProvider | null;
  resend: { hasSecret: boolean; secretHint: string | null };
  smtp: { host: string | null; port: number | null; secure: boolean; user: string | null; hasSecret: boolean; secretHint: string | null; url: string | null };
  secretError: string | null;
  status: ConnectionStatus;
  check: Pick<ConnectionCheck, "at" | "ok" | "latencyMs" | "error"> | null;
  envVars: string[];
};

export async function getEmailConnectionView(ownerId: string): Promise<EmailConnectionView> {
  const stored = await loadConnection("email", ownerId);
  const fromEnv = emailConfigFromEnv();
  const active = resolveEmailConfig(fromEnv, emailConfigFromStored(stored));
  const check = stored?.check ?? null;
  const status = statusFor({ configured: active.provider !== "off", source: active.source, fingerprint: emailFingerprint(active) }, check);
  const storedProvider = stored && (UI_EMAIL_PROVIDERS as readonly string[]).includes(stored.provider) ? (stored.provider as UiEmailProvider) : null;
  const db = active.source === "db";
  const cfg = stored?.config ?? {};
  const smtpEnv = active.provider === "smtp" && active.source === "env" ? active.smtp : null;
  return {
    source: active.source,
    provider: active.provider,
    from: active.from,
    defaultFrom: envValue(process.env, "EMAIL_FROM") ?? DEFAULT_EMAIL_FROM,
    storedProvider,
    resend: {
      hasSecret: db ? stored?.provider === "resend" && !!stored.secretHint : active.provider === "resend",
      secretHint: db ? (stored?.provider === "resend" ? stored.secretHint : null) : active.provider === "resend" ? secretHint(active.apiKey) : null,
    },
    smtp: {
      host: db ? (str(cfg.host) ?? null) : null,
      port: db && typeof cfg.port === "number" ? cfg.port : null,
      secure: db ? cfg.secure === true : false,
      user: db ? (str(cfg.user) ?? null) : null,
      hasSecret: db && stored?.provider === "smtp" && !!stored.secretHint,
      secretHint: db && stored?.provider === "smtp" ? stored.secretHint : null,
      url: smtpEnv?.url ? redactSmtpUrl(smtpEnv.url) : null,
    },
    secretError: db ? (stored?.secretError ?? null) : null,
    status,
    check: check && status !== "untested" && status !== "off" ? { at: check.at, ok: check.ok, latencyMs: check.latencyMs, error: check.error } : null,
    envVars: fromEnv ? EMAIL_ENV_VARS.filter((n) => !!envValue(process.env, n)) : [],
  };
}

export type SaveEmailInput = {
  provider: UiEmailProvider;
  from?: string | null;
  /** Resend API key — `undefined` keeps, `""` clears. */
  apiKey?: string | null;
  smtp?: { host?: string | null; port?: number | null; secure?: boolean; user?: string | null; pass?: string | null };
};

export async function saveEmailConnection(ownerId: string, input: SaveEmailInput) {
  const config: Record<string, unknown> = {};
  if (input.from?.trim()) config.from = input.from.trim();
  let secret: string | null | undefined = null;
  if (input.provider === "resend") secret = input.apiKey;
  if (input.provider === "smtp") {
    const s = input.smtp ?? {};
    if (s.host?.trim()) config.host = s.host.trim();
    if (s.port) config.port = s.port;
    config.secure = !!s.secure;
    if (s.user?.trim()) config.user = s.user.trim();
    secret = s.pass;
  }
  await saveConnection(ownerId, "email", { provider: input.provider, config, secret });
}
