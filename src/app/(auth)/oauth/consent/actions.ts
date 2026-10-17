"use server";
import { getOwner } from "@/lib/auth/server";
import { recordAudit } from "@/lib/data/audit";
import { upsertGrant } from "@/lib/data/oauth-grants";
import { forgetGrant } from "@/lib/mcp/auth";
import { scopesFor, type Access } from "@/lib/mcp/tokens";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Consent decisions for the Supabase OAuth server. Both return the URL to send the browser to;
 * the page navigates there itself (`window.location`), because a form-post redirect to another
 * origin would be blocked by a `form-action 'self'` CSP.
 */

export type ConsentResult = { ok: true; redirectUrl: string } | { ok: false; message: string };

const EXPIRED = "This connection request has expired. Start connecting again from the app.";

async function signedInOwner() {
  const owner = await getOwner();
  return owner?.mfaSatisfied ? owner : null;
}

export async function approveConsent(authorizationId: string, access: Access): Promise<ConsentResult> {
  const owner = await signedInOwner();
  if (!owner) return { ok: false, message: "Please sign in again." };
  if (access !== "read" && access !== "write") return { ok: false, message: "Choose an access level." };
  const supabase = await supabaseServer();

  // Never trust client-supplied client details: read the request again on the server.
  const { data: details, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !details) return { ok: false, message: EXPIRED };
  if ("redirect_url" in details) return { ok: true, redirectUrl: details.redirect_url };
  if (details.user.id !== owner.id) return { ok: false, message: "This request belongs to another account." };

  // Grant first: the client's first MCP call may arrive right after the redirect.
  const scopes = scopesFor(access);
  await upsertGrant(owner.id, { clientId: details.client.id, clientName: details.client.name || null, scopes });
  forgetGrant(owner.id, details.client.id);

  const { data, error: approveError } = await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true });
  if (approveError || !data?.redirect_url) return { ok: false, message: EXPIRED };
  await recordAudit({ ownerId: owner.id, actor: "user", action: "grant.approve", entity: "oauth_client", entityId: details.client.id, meta: { name: details.client.name, scopes } });
  return { ok: true, redirectUrl: data.redirect_url };
}

export async function denyConsent(authorizationId: string): Promise<ConsentResult> {
  const owner = await signedInOwner();
  if (!owner) return { ok: false, message: "Please sign in again." };
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
  if (error || !data?.redirect_url) return { ok: false, message: EXPIRED };
  return { ok: true, redirectUrl: data.redirect_url };
}
