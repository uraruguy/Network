import { z } from "zod";

const server = z.object({
  DATABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  AI_PROVIDER: z.enum(["agent-sdk", "anthropic", "openrouter"]).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  OPENROUTER_MODEL: z.string().default("anthropic/claude-opus-5"),
  AI_MODEL_MAIN: z.string().min(1).optional(),
  AI_MODEL_FAST: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().default("The Network <onboarding@resend.dev>"),
  CRON_SECRET: z.string().min(16).optional(),
  INBOX_TOKEN: z.string().min(16).optional(),
  ALLOWED_EMAIL: z.string().email().optional(),
});

const client = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

export const clientEnv = client.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});

let _serverEnv: z.infer<typeof server> | null = null;
export function serverEnv() {
  if (typeof window !== "undefined") throw new Error("serverEnv() called in the browser");
  if (!_serverEnv) _serverEnv = server.parse(process.env);
  return _serverEnv;
}
