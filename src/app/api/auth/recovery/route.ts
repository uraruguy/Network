import { cookies } from "next/headers";
import { z } from "zod";
import { setMfaCookie } from "@/lib/auth/mfa";
import { consumeRecoveryCode, countUnusedRecoveryCodes } from "@/lib/data/passkeys";
import { HttpError } from "@/lib/errors";
import { createRateLimiter } from "@/lib/security/rate-limit";
import { assertSameOrigin, authRoute, ok, readJson, requireSession } from "../_lib/guard";
import { notifySecurityEvent } from "../_lib/notify";

const body = z.object({ code: z.string().trim().min(1).max(40) });
/** Per account: the code space (30^12) is the real protection; this keeps guessing noisy and slow. */
const attempts = createRateLimiter({ limit: 5, windowMs: 15 * 60_000 });

/**
 * Passkey fallback: a one-time recovery code verifies this session instead of a passkey.
 * Each code works once; the owner gets an e-mail whenever one is used.
 */
export const POST = authRoute(async (req) => {
  assertSameOrigin(req);
  const owner = await requireSession();
  if (!attempts.hit(owner.id)) throw new HttpError(429, "Too many attempts. Wait 15 minutes and try again.", "rate_limited");
  const { code } = await readJson(req, body);
  if (!(await consumeRecoveryCode(owner.id, code))) throw new HttpError(400, "That code didn't work. Check it and try again.", "invalid_code");

  setMfaCookie(await cookies(), owner.claims);
  const remaining = await countUnusedRecoveryCodes(owner.id);
  notifySecurityEvent(owner.claims.email, { kind: "recovery_code_used", remaining }, req.headers.get("user-agent"));
  return ok({ ok: true, remaining });
});
