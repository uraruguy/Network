import { z } from "zod";
import { notFound, parseQuery, withOwner } from "@/lib/api-server";
import { recordAudit } from "@/lib/data/audit";
import { revokeGrant } from "@/lib/data/oauth-grants";
import { APPROVAL_ACTIONS } from "@/lib/mcp/approvals";
import { forgetGrant } from "@/lib/mcp/auth";
import { supabaseServer } from "@/lib/supabase/server";

const query = z.object({ client: z.string().min(1).max(500) });

/**
 * DELETE /api/tokens/grants?client=<client id> — disconnects an OAuth app (e.g. a claude.ai
 * connector). Our grant row is revoked first, which blocks the client at once; then Supabase is
 * asked to drop its consent and refresh tokens, so the next connection asks for consent again.
 * The audit entry also ends every OAuth session minted before it (src/lib/mcp/approvals.ts), even
 * if the app is approved again later.
 */
export const DELETE = withOwner(async ({ ownerId, url }) => {
  const { client } = parseQuery(url, query);
  if (!(await revokeGrant(ownerId, client))) notFound();
  forgetGrant(ownerId, client);
  try {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.oauth.revokeGrant({ clientId: client });
    if (error) console.warn("[tokens] Supabase revokeGrant:", error.message);
  } catch (err) {
    // OAuth server disabled (e.g. local dev): our revocation alone already blocks the client.
    console.warn("[tokens] Supabase revokeGrant failed", err);
  }
  await recordAudit({ ownerId, actor: "user", action: APPROVAL_ACTIONS.revoke, entity: "oauth_client", entityId: client });
  return { ok: true };
}, { fresh: true });
