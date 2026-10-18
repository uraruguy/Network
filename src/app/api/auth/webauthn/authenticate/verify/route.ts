import { cookies } from "next/headers";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { z } from "zod";
import { setMfaCookie } from "@/lib/auth/mfa";
import { CHALLENGE_COOKIE, verifyAuthentication } from "@/lib/auth/webauthn";
import { HttpError } from "@/lib/errors";
import { createRateLimiter } from "@/lib/security/rate-limit";
import { assertSameOrigin, authRoute, clearChallengeCookie, credentialResponse, ok, readJson, requireSession, rpOrigin } from "../../../_lib/guard";

const body = z.object({ response: credentialResponse });
const attempts = createRateLimiter({ limit: 20, windowMs: 10 * 60_000 });

/** Step 2 of the passkey check: verifies the assertion and marks this session as verified. */
export const POST = authRoute(async (req) => {
  assertSameOrigin(req);
  const owner = await requireSession();
  if (!attempts.hit(owner.claims.sessionId)) throw new HttpError(429, "Too many attempts. Wait a few minutes.", "rate_limited");
  const { response } = await readJson(req, body);

  const jar = await cookies();
  const challengeCookie = jar.get(CHALLENGE_COOKIE)?.value;
  clearChallengeCookie(jar); // one attempt per challenge
  const result = await verifyAuthentication({
    claims: owner.claims,
    response: response as unknown as AuthenticationResponseJSON,
    challengeCookie,
    origin: rpOrigin(req),
  });
  if (!result.ok) {
    throw result.reason === "challenge"
      ? new HttpError(400, "That took too long. Try again.", "challenge_expired")
      : result.reason === "unknown_credential"
        ? new HttpError(400, "This passkey isn't registered for your account.", "unknown_credential")
        : new HttpError(400, "This passkey couldn't be verified.", "verification_failed");
  }
  setMfaCookie(jar, owner.claims);
  return ok({ ok: true });
});
