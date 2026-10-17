import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { verifySession } from "@/lib/auth/claims";
import { MFA_COOKIE, isMfaSatisfied } from "@/lib/auth/mfa";
import { safeNext } from "@/lib/auth/redirect";
import { classify, isLoginPage } from "@/lib/auth/routes";

/**
 * Auth gate for every page and API request (see src/lib/auth/routes.ts for the route classes).
 *
 * One local JWT verification per request (`getClaims()` — refreshes the Supabase cookies when the
 * access token expired). API handlers re-verify on their own (`withOwner`), so this is the first of
 * two gates, not the only one.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const kind = classify(pathname);
  if (kind === "machine" || (kind === "public" && !isLoginPage(pathname))) return NextResponse.next();

  // Standard @supabase/ssr cookie plumbing: refreshed tokens go to both the forwarded request and
  // the response, together with the no-cache headers the library asks for.
  let response = NextResponse.next({ request });
  const pendingCookies: Parameters<typeof response.cookies.set>[] = [];
  const pendingHeaders: Record<string, string> = {};
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => pendingCookies.push([name, value, options]));
        Object.assign(pendingHeaders, headers);
      },
    },
  });
  /** Applies refreshed auth cookies to whatever response we end up sending. */
  const finish = (res: NextResponse) => {
    pendingCookies.forEach((args) => res.cookies.set(...args));
    Object.entries(pendingHeaders).forEach(([k, v]) => res.headers.set(k, v));
    return res;
  };
  const redirectTo = (path: string, next?: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    if (next) url.searchParams.set("next", next);
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
  const here = pathname + search;

  if (kind === "public") {
    // Sign-in page: already signed in → straight on.
    if (!claims) return finish(response);
    const next = safeNext(request.nextUrl.searchParams.get("next"), request.nextUrl.origin);
    return mfa ? redirectTo(next) : redirectTo("/login/verify", next);
  }

  if (kind === "mfa-step") {
    if (!claims) return pathname.startsWith("/api/") ? deny("unauthenticated") : redirectTo("/login", here);
    // Passkey already proven: skip the verify page.
    if (mfa && !pathname.startsWith("/api/")) return redirectTo(safeNext(request.nextUrl.searchParams.get("next"), request.nextUrl.origin));
    return finish(response);
  }

  if (kind === "api") {
    if (!claims) return deny("unauthenticated");
    if (!mfa) return deny("mfa_required");
    return finish(response);
  }

  // page
  if (!claims) return redirectTo("/login", here);
  if (!mfa) return redirectTo("/login/verify", here);
  return finish(response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|js|map|txt|woff2?)$).*)"],
};
