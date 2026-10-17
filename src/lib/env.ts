import { z } from "zod";

/**
 * Environment variables. Server values are parsed lazily (first `serverEnv()` call) so client
 * bundles never touch them. See README / .env.example for what each one does.
 */
const server = z.object({
  DATABASE_URL: z.string().url(),
  /**
   * Root secret for everything the app signs or encrypts itself (passkey session cookie, WebAuthn
   * challenges, encrypted connection secrets). ≥ 32 chars. Generate: `openssl rand -base64 48`.
   * Required in production; there is deliberately no fallback.
   */
  APP_SECRET: z.string().min(32).optional(),
  /** Previous APP_SECRET during a rotation: still accepted for verification, never used to sign. */
  APP_SECRET_PREVIOUS: z.string().min(32).optional(),
  /** Passkey second factor. Defaults to required; set "false" only for local development. */
  AUTH_REQUIRE_PASSKEY: z.enum(["true", "false"]).optional(),
  AI_PROVIDER: z.enum(["agent-sdk", "anthropic", "openrouter"]).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  OPENROUTER_MODEL: z.string().default("anthropic/claude-sonnet-5.5"),
  AI_MODEL_MAIN: z.string().min(1).optional(),
  AI_MODEL_FAST: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  /** SMTP transport instead of Resend, e.g. smtps://user:pass@smtp.example.com:465 (overrides RESEND_API_KEY). */
  SMTP_URL: z.string().url().optional(),
  EMAIL_FROM: z.string().default("The Network <onboarding@resend.dev>"),
  CRON_SECRET: z.string().min(16).optional(),
  INBOX_TOKEN: z.string().min(16).optional(),
});

const client = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3100"),
});

export const clientEnv = client.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});

export type ServerEnv = z.infer<typeof server>;

let _serverEnv: ServerEnv | null = null;
export function serverEnv(): ServerEnv {
  if (typeof window !== "undefined") throw new Error("serverEnv() called in the browser");
  if (!_serverEnv) {
    const parsed = server.parse(process.env);
    if (process.env.NODE_ENV === "production" && !parsed.APP_SECRET && process.env.NEXT_PHASE !== "phase-production-build") {
      throw new Error("APP_SECRET is required in production (≥ 32 chars). Generate one with: openssl rand -base64 48");
    }
    _serverEnv = parsed;
  }
  return _serverEnv;
}
