import { z } from "zod";
import { HttpError, parseBody, withOwner } from "@/lib/api-server";
import { canManagePasskeys, passkeyRequired } from "@/lib/auth/mfa";
import { countCredentials, deleteCredential, renameCredential } from "@/lib/data/passkeys";

/** Credential ids are base64url WebAuthn ids, not UUIDs. */
const params = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,1024}$/) });
const rename = z.object({ name: z.string().trim().min(1).max(60) });

/** Changing passkeys needs a session that proved one (not just a password). */
async function assertCanManage(ownerId: string, mfaVerified: boolean) {
  const credentialCount = await countCredentials(ownerId);
  if (!canManagePasskeys({ credentialCount, mfaVerified })) throw new HttpError(403, "Confirm with a passkey first.", "verification_required");
  return credentialCount;
}

export const PATCH = withOwner<{ id: string }>(
  async ({ ownerId, owner, req, params: { id } }) => {
    await assertCanManage(ownerId, owner.mfaVerified);
    const { name } = await parseBody(req, rename);
    const row = await renameCredential(ownerId, id, name);
    if (!row) throw new HttpError(404, "Not found");
    return { ...row, createdAt: row.createdAt.toISOString(), lastUsedAt: row.lastUsedAt?.toISOString() ?? null };
  },
  { params },
);

export const DELETE = withOwner<{ id: string }>(
  async ({ ownerId, owner, params: { id } }) => {
    const count = await assertCanManage(ownerId, owner.mfaVerified);
    // Removing the last passkey while it's required would lock the owner out on the next sign-in.
    if (count <= 1 && passkeyRequired()) throw new HttpError(409, "Add another passkey before removing your last one.", "last_passkey");
    if (!(await deleteCredential(ownerId, id))) throw new HttpError(404, "Not found");
    return { ok: true };
  },
  { params },
);
