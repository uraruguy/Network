import { notFound, withOwner } from "@/lib/api-server";
import { revokeToken } from "@/lib/data/api-tokens";
import { recordAudit } from "@/lib/data/audit";

/** DELETE /api/tokens/[id] — revokes a personal access token (it stops working immediately). */
export const DELETE = withOwner<{ id: string }>(async ({ ownerId, params }) => {
  if (!(await revokeToken(ownerId, params.id))) notFound();
  await recordAudit({ ownerId, actor: "user", action: "token.revoke", entity: "api_token", entityId: params.id });
  return { ok: true };
});
