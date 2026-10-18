import { z } from "zod";
import { HttpError, parseBody, withOwner } from "@/lib/api-server";
import { canManagePasskeys } from "@/lib/auth/mfa";
import { countCredentials } from "@/lib/data/passkeys";
import { passwordProblem } from "@/lib/security/password";
import { supabaseServer } from "@/lib/supabase/server";

const body = z.object({ password: z.string().max(256) });

/**
 * Settings → Change password. Runs server-side so the policy and the passkey requirement are
 * enforced in one place; on success every other session is signed out (this one stays).
 */
export const POST = withOwner(async ({ ownerId, owner, req }) => {
  if (!canManagePasskeys({ credentialCount: await countCredentials(ownerId), mfaVerified: owner.mfaVerified })) {
    throw new HttpError(403, "Confirm with a passkey first.", "verification_required");
  }
  const { password } = await parseBody(req, body);
  const problem = passwordProblem(password);
  if (problem) throw new HttpError(422, problem, "weak_password");

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") throw new HttpError(422, "Choose a password you haven't used here before.", "same_password");
    if (error.code === "weak_password") throw new HttpError(422, "That password is too easy to guess.", "weak_password");
    if (error.code === "reauthentication_needed") throw new HttpError(403, "Sign in again, then change your password.", "reauthentication_needed");
    throw new HttpError(400, error.message || "Couldn't change the password.", "password_change_failed");
  }
  // Best effort: a stolen session elsewhere shouldn't outlive a password change.
  const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });
  return { ok: true, otherSessionsSignedOut: !signOutError };
}, { fresh: true });
