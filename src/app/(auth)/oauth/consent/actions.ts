"use server";
import { getOwner } from "@/lib/auth/server";
import { upsertGrant } from "@/lib/data/oauth-grants";
import { clientEnv } from "@/lib/env";
import { recordApproval, recordReauthorization } from "@/lib/mcp/approval-log";
import { forgetGrant } from "@/lib/mcp/auth";
import { consentPolicy, redirectProblem } from "@/lib/mcp/consent";
import { scopesFor, type Access } from "@/lib/mcp/tokens";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Consent decisions for the Supabase OAuth server. All return the URL to send the browser to;
 * the page navigates there itself (`window.location`), because a form-post redirect to another
 * origin would be blocked by a `form-action 'self'` CSP.
 *
 * Every hand-off of a code is recorded in the audit log (approval-log.ts): /api/mcp only honours
 * an OAuth session created minutes after one of these passkey-verified events. Codes only go to
 * public https redirect URIs (consent.ts) — apps on a computer use personal access tokens.
 */

export type ConsentResult = { ok: true; redirectUrl: string } | { ok: false; message: string };

const EXPIRED = "This connection request has expired. Start connecting again from the app.";
const LOCAL_APP = "This app runs on your computer. Connect it with a personal access token instead (Settings → Connected apps).";

async function signedInOwner() {
  const owner = await getOwner();
  return owner?.mfaSatisfied ? owner : null;
}

const allowed = (uri: string) => redirectProblem(uri, consentPolicy(clientEnv.NEXT_PUBLIC_APP_URL)) === null;

/** Base of a redirect URL (no code, state or fragment) — what the audit log keeps. */
function redirectBase(url: string) {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url.slice(0, 200);
  }
}

export async function approveConsent(authorizationId: string, access: Access): Promise<ConsentResult> {
  const owner = await signedInOwner();
  if (!owner) return { ok: false, message: "Please sign in again." };
  if (access !== "read" && access !== "write") return { ok: false, message: "Choose an access level." };
  const supabase = await supabaseServer();

  // Never trust client-supplied client details: read the request again on the server.
  const { data: details, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !details) return { ok: false, message: EXPIRED };
  if ("redirect_url" in details) return reconnectConsent(details.redirect_url);
  if (details.user.id !== owner.id) return { ok: false, message: "This request belongs to another account." };
  if (!allowed(details.redirect_uri)) return { ok: false, message: LOCAL_APP };

  // Grant first: the client's first MCP call may arrive right after the redirect.
  const scopes = scopesFor(access);
  await upsertGrant(owner.id, { clientId: details.client.id, clientName: details.client.name || null, scopes });
  forgetGrant(owner.id, details.client.id);

  const { data, error: approveError } = await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true });
  if (approveError || !data?.redirect_url) return { ok: false, message: EXPIRED };
  await recordApproval(owner.id, { id: details.client.id, name: details.client.name || null }, { scopes, redirectUri: details.redirect_uri });
  return { ok: true, redirectUrl: data.redirect_url };
}

/**
 * Continue to an app that was approved before: Supabase already issued the code (it never asks
 * twice), so all that's left is to record the passkey-verified hand-off and navigate. The URL
 * comes from the page; only the signed-in owner can call this, and only for allowed destinations.
 */
export async function reconnectConsent(redirectUrl: string): Promise<ConsentResult> {
  const owner = await signedInOwner();
  if (!owner) return { ok: false, message: "Please sign in again." };
  if (typeof redirectUrl !== "string" || redirectUrl.length > 4000 || !allowed(redirectUrl)) return { ok: false, message: LOCAL_APP };
  await recordReauthorization(owner.id, redirectBase(redirectUrl));
  return { ok: true, redirectUrl };
}

export async function denyConsent(authorizationId: string): Promise<ConsentResult> {
  const owner = await signedInOwner();
  if (!owner) return { ok: false, message: "Please sign in again." };
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
  if (error || !data?.redirect_url) return { ok: false, message: EXPIRED };
  return { ok: true, redirectUrl: data.redirect_url };
}
