import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { verifySession } from "@/lib/auth/claims";
import { MFA_COOKIE, isMfaSatisfied } from "@/lib/auth/mfa";
import { safeNext } from "@/lib/auth/redirect";
import { classify, isLoginPage } from "@/lib/auth/routes";
import { CSP_HEADER, generateNonce, nonceCsp, reportingEndpoints, scriptHash, serializeCsp, usesNonceCsp } from "@/lib/security/csp";
import { headInlineScript } from "@/lib/security/inline-scripts";

/**
 * Auth gate for every page and API request (see src/lib/auth/routes.ts for the route classes),
 * plus the per-request nonce CSP for the sign-in pages (see src/lib/security/csp.ts).
 *
 * One local JWT verification per request (`getClaims()` — refreshes the Supabase cookies when the
 * access token expired). API handlers re-verify on their own (`withOwner`), so this is the first of
 * two gates, not the only one.
 */

const dev = process.env.NODE_ENV === "development";
/** The root layout's inline theme script, allowed by hash under 'strict-dynamic'. */
const INLINE_SCRIPT_HASHES = [scriptHash(headInlineScript(dev))];

/** Strict CSP for one sign-in page response. Next reads the nonce from the forwarded request header. */
function signInCsp() {
  const nonce = generateNonce();
  const policy = serializeCsp(nonceCsp(nonce, { supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, dev, inlineScriptHashes: INLINE_SCRIPT_HASHES }));
  return { nonce, policy };
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const kind = classify(pathname);
  if (kind === "machine" || (kind === "public" && !isLoginPage(pathname))) return NextResponse.next();

  const csp = usesNonceCsp(pathname) ? signInCsp() : null;

  // Standard @supabase/ssr cookie plumbing: refreshed tokens go to both the forwarded request and
  // the response, together with the no-cache headers the library asks for.
  const pendingCookies: Parameters<NextResponse["cookies"]["set"]>[] = [];
  const pendingHeaders: Record<string, string> = {};
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        // Updates request.headers' Cookie line too, so `pass()` forwards the fresh tokens.
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        cookiesToSet.forEach(({ name, value, options }) => pendingCookies.push([name, value, options]));
        Object.assign(pendingHeaders, headers);
      },
    },
  });

  /** Applies refreshed auth cookies (and the sign-in CSP) to whatever response we end up sending. */
  const finish = (res: NextResponse) => {
    pendingCookies.forEach((args) => res.cookies.set(...args));
    Object.entries(pendingHeaders).forEach(([k, v]) => res.headers.set(k, v));
    if (csp) {
      res.headers.set(CSP_HEADER, csp.policy);
      res.headers.set("Reporting-Endpoints", reportingEndpoints());
    }
    return res;
  };
  /** Lets the request through to the route, forwarding refreshed cookies and the nonce upstream. */
  const pass = () => {
    const headers = new Headers(request.headers);
    if (csp) {
      headers.set("x-nonce", csp.nonce);
      headers.set(CSP_HEADER, csp.policy);
    }
    return finish(NextResponse.next({ request: { headers } }));
  };
  const redirectTo = (path: string, params: Record<string, string> = {}) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return finish(NextResponse.redirect(url));
  };
  const deny = (error: "unauthenticated" | "mfa_required") =>
    finish(
      NextResponse.json(
        { error, message: error === "unauthenticated" ? "Not signed in" : "Passkey verification required" },
        { status: 401, headers: { "cache-control": "private, no-store" } },
      ),
    );

  const claims = await verifySession(supabase);
  const mfa = claims ? isMfaSatisfied({ claims, cookie: request.cookies.get(MFA_COOKIE)?.value }) : false;
  const next = () => safeNext(request.nextUrl.searchParams.get("next"), request.nextUrl.origin);

  if (kind === "public") {
    // Sign-in page: already signed in → straight on.
    if (!claims) return pass();
    return mfa ? redirectTo(next()) : redirectTo("/login/verify", { next: next() });
  }

  if (kind === "mfa-step") {
    if (!claims) {
      if (pathname.startsWith("/api/")) return deny("unauthenticated");
      // Reset links create the session; without one the link expired or opened in another browser.
      if (pathname === "/login/reset") return redirectTo("/login", { error: "reset" });
      // No password session yet: sign in first, then continue to where the verify step was headed.
      return redirectTo("/login", { next: next() });
    }
    // Passkey already proven: skip the verify page.
    if (mfa && pathname === "/login/verify") return redirectTo(next());
    return pass();
  }

  if (kind === "api") {
    if (!claims) return deny("unauthenticated");
    if (!mfa) return deny("mfa_required");
    return pass();
  }

  // page
  const here = pathname + search;
  if (!claims) return redirectTo("/login", { next: here });
  if (!mfa) return redirectTo("/login/verify", { next: here });
  return pass();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|js|map|txt|woff2?)$).*)"],
};
