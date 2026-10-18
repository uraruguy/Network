import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, NO_STORE, parseBody, withOwner } from "@/lib/api-server";
import { createToken, listTokens, TooManyTokensError } from "@/lib/data/api-tokens";
import { recordAudit } from "@/lib/data/audit";
import { listGrants } from "@/lib/data/oauth-grants";
import { mcpResourceUrl } from "@/lib/mcp/config";
import { scopesFor } from "@/lib/mcp/tokens";

/**
 * Connected apps.
 *   GET  /api/tokens → { mcpUrl, tokens, grants }   active personal access tokens + OAuth grants
 *   POST /api/tokens { name, access: "read" | "write" } → 201 { token, item }
 *        The plaintext `token` is in this response only; it can't be shown again.
 */

export const GET = withOwner(async ({ ownerId }) => {
  const [tokens, grants] = await Promise.all([listTokens(ownerId), listGrants(ownerId)]);
  return { mcpUrl: mcpResourceUrl(), tokens, grants };
}, { fresh: true });

const createInput = z.object({
  name: z.string().trim().min(1).max(60),
  access: z.enum(["read", "write"]).default("read"),
});

export const POST = withOwner(async ({ ownerId, req }) => {
  const input = await parseBody(req, createInput);
  try {
    const { token, item } = await createToken(ownerId, { name: input.name, scopes: scopesFor(input.access) });
    await recordAudit({ ownerId, actor: "user", action: "token.create", entity: "api_token", entityId: item.id, meta: { name: item.name, scopes: item.scopes } });
    return NextResponse.json({ token, item, mcpUrl: mcpResourceUrl() }, { status: 201, headers: { "cache-control": NO_STORE } });
  } catch (err) {
    if (err instanceof TooManyTokensError) throw new HttpError(409, err.message);
    throw err;
  }
}, { fresh: true });
