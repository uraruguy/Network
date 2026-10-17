import { cookies } from "next/headers";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { z } from "zod";
import { canManagePasskeys, setMfaCookie } from "@/lib/auth/mfa";
import { CHALLENGE_COOKIE, verifyRegistration } from "@/lib/auth/webauthn";
import { countCredentials, generateRecoveryCodes } from "@/lib/data/passkeys";
import { HttpError } from "@/lib/errors";
import { assertSameOrigin, authRoute, clearChallengeCookie, credentialResponse, ok, readJson, requireSession, rpOrigin } from "../../../_lib/guard";
import { notifySecurityEvent } from "../../../_lib/notify";

const body = z.object({ response: credentialResponse, name: z.string().trim().max(60).nullish() });

/**
 * Step 2 of adding a passkey: verifies the attestation and stores the credential. Proving the new
 * passkey also verifies this session. Enrolling the very first passkey returns a fresh set of
 * recovery codes — the only time they are ever shown.
 */
export const POST = authRoute(async (req) => {
  assertSameOrigin(req);
  const owner = await requireSession();
  const { response, name } = await readJson(req, body);
  const before = await countCredentials(owner.id);
  if (!canManagePasskeys({ credentialCount: before, mfaVerified: owner.mfaVerified })) {
    throw new HttpError(403, "Confirm with an existing passkey first.", "verification_required");
  }

  const jar = await cookies();
  const challengeCookie = jar.get(CHALLENGE_COOKIE)?.value;
  clearChallengeCookie(jar); // one attempt per challenge
  const result = await verifyRegistration({
    claims: owner.claims,
    response: response as unknown as RegistrationResponseJSON,
    challengeCookie,
    name,
    origin: rpOrigin(req),
  });
  if (!result.ok) {
    throw result.reason === "challenge"
      ? new HttpError(400, "That took too long. Try again.", "challenge_expired")
      : new HttpError(400, "This passkey couldn't be verified.", "verification_failed");
  }

  const recoveryCodes = before === 0 ? await generateRecoveryCodes(owner.id) : undefined;
  setMfaCookie(jar, owner.claims);
  notifySecurityEvent(owner.claims.email, { kind: "passkey_added", name: result.credential.name }, req.headers.get("user-agent"));
  return ok({ ok: true, credential: result.credential, recoveryCodes });
});
