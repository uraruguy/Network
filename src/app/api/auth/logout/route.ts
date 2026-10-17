import { cookies } from "next/headers";
import { clearMfaCookie } from "@/lib/auth/mfa";
import { assertSameOrigin, authRoute, clearChallengeCookie, ok } from "../_lib/guard";

/**
 * Clears the httpOnly passkey cookie (the client can't). Part of `signOutEverywhere()`; the
 * Supabase session itself is ended by the client. Works without a session (machine route), so a
 * half-finished or lapsed sign-in can always be cleaned up.
 */
export const POST = authRoute(async (req) => {
  assertSameOrigin(req);
  const jar = await cookies();
  clearMfaCookie(jar);
  clearChallengeCookie(jar);
  return ok({ ok: true });
});
