import { cookies } from "next/headers";
import { canManagePasskeys } from "@/lib/auth/mfa";
import { CHALLENGE_COOKIE, challengeCookieOptions, registrationOptions } from "@/lib/auth/webauthn";
import { countCredentials } from "@/lib/data/passkeys";
import { HttpError } from "@/lib/errors";
import { assertSameOrigin, authRoute, ok, requireSession, rpOrigin } from "../../../_lib/guard";

/**
 * Step 1 of adding a passkey: creation options + a signed challenge cookie.
 * The first passkey may be enrolled by a password session (bootstrap); every later one needs a
 * session that already proved a passkey.
 */
export const POST = authRoute(async (req) => {
  assertSameOrigin(req);
  const owner = await requireSession();
  const credentialCount = await countCredentials(owner.id);
  if (!canManagePasskeys({ credentialCount, mfaVerified: owner.mfaVerified })) {
    throw new HttpError(403, "Confirm with an existing passkey first.", "verification_required");
  }
  const { options, challengeCookie } = await registrationOptions(owner.claims, rpOrigin(req));
  (await cookies()).set(CHALLENGE_COOKIE, challengeCookie, challengeCookieOptions);
  return ok(options);
});
