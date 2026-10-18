import { HttpError, withOwner } from "@/lib/api-server";
import { countCredentials, generateRecoveryCodes } from "@/lib/data/passkeys";

/**
 * Replaces all recovery codes with a fresh set and returns them — the only time they're shown.
 * Old codes stop working immediately. Requires a passkey-verified session.
 */
export const POST = withOwner(async ({ ownerId, owner }) => {
  if ((await countCredentials(ownerId)) === 0) throw new HttpError(409, "Add a passkey first.", "no_passkeys");
  if (!owner.mfaVerified) throw new HttpError(403, "Confirm with a passkey first.", "verification_required");
  return { codes: await generateRecoveryCodes(ownerId) };
}, { fresh: true });
