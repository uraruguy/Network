import { withOwner } from "@/lib/api-server";
import { passkeyRequired } from "@/lib/auth/mfa";
import { countUnusedRecoveryCodes, listCredentials } from "@/lib/data/passkeys";
import type { SecurityOverview } from "@/lib/security/types";

/** Settings → Security: passkeys (no key material), recovery codes left, and the session's state. */
export const GET = withOwner(async ({ ownerId, owner }): Promise<SecurityOverview> => {
  const [passkeys, recoveryCodesLeft] = await Promise.all([listCredentials(ownerId), countUnusedRecoveryCodes(ownerId)]);
  return {
    passkeys: passkeys.map((p) => ({ ...p, createdAt: p.createdAt.toISOString(), lastUsedAt: p.lastUsedAt?.toISOString() ?? null })),
    recoveryCodesLeft,
    passkeyRequired: passkeyRequired(),
    mfaVerified: owner.mfaVerified,
  };
}, { fresh: true });
