import { cookies } from "next/headers";
import { authenticationOptions, CHALLENGE_COOKIE, challengeCookieOptions } from "@/lib/auth/webauthn";
import { HttpError } from "@/lib/errors";
import { assertSameOrigin, authRoute, ok, requireSession, rpOrigin } from "../../../_lib/guard";

/** Step 1 of the passkey check: request options for the owner's credentials + challenge cookie. */
export const POST = authRoute(async (req) => {
  assertSameOrigin(req);
  const owner = await requireSession();
  const { options, challengeCookie, credentialCount } = await authenticationOptions(owner.claims, rpOrigin(req));
  if (credentialCount === 0) throw new HttpError(409, "No passkey is set up yet.", "no_passkeys");
  (await cookies()).set(CHALLENGE_COOKIE, challengeCookie, challengeCookieOptions);
  return ok(options);
});
