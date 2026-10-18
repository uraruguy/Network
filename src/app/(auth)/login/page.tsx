import type { Metadata } from "next";
import { connection } from "next/server";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const NOTICES: Record<string, string> = {
  auth: "That sign-in link was invalid or has expired.",
  reset: "That reset link has expired or was opened in a different browser. Request a new one below.",
};

/**
 * Password step. Rendered per request (`connection()`) so the proxy's nonce CSP applies.
 * There is deliberately no sign-up: the single owner account is created in Supabase.
 */
export default async function LoginPage({ searchParams }: Props) {
  await connection();
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  return (
    <AuthScreen title="The Network" subtitle="Sign in to your people.">
      <LoginForm next={next} notice={error ? (NOTICES[error] ?? NOTICES.auth!) : null} startInReset={error === "reset"} />
    </AuthScreen>
  );
}
