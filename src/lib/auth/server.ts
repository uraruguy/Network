import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { supabaseServer } from "@/lib/supabase/server";
import { verifySession, type SessionClaims } from "./claims";
import { MFA_COOKIE, isMfaSatisfied, verifyMfaCookie } from "./mfa";

export type Owner = {
  /** auth.users.id — pass as `ownerId` to every data function. */
  id: string;
  claims: SessionClaims;
  /** The session may use the app (passkey proven, or passkeys not required). */
  mfaSatisfied: boolean;
  /** A passkey was actually proven for this session (needed to manage passkeys). */
  mfaVerified: boolean;
};

/**
 * The signed-in owner for this request, or null. Verifies the Supabase JWT locally (no Auth
 * round trip) and checks the passkey cookie. Memoised per request in server components.
 */
export const getOwner = cache(async (): Promise<Owner | null> => {
  const supabase = await supabaseServer();
  const claims = await verifySession(supabase);
  if (!claims) return null;
  const cookie = (await cookies()).get(MFA_COOKIE)?.value;
  return {
    id: claims.sub,
    claims,
    mfaSatisfied: isMfaSatisfied({ claims, cookie }),
    mfaVerified: verifyMfaCookie(cookie, claims.sub, claims.sessionId),
  };
});
