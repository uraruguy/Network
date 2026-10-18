import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/auth/redirect";
import { supabaseServer } from "@/lib/supabase/server";

/** The one sign-in-flow page a Supabase e-mail link may continue to (safeNext refuses /login/*). */
const RESET_PAGE = "/login/reset";

/**
 * Lands Supabase Auth e-mail links (PKCE): exchanges the one-time code for a session, then
 * continues to `next`. Password reset links continue to /login/reset; the code verifier lives in
 * this browser, so a link opened elsewhere fails and the user is asked to request a new one.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next");
  const isReset = rawNext === RESET_PAGE;
  const next = isReset ? RESET_PAGE : safeNext(rawNext, origin);
  if (code && code.length <= 512) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }
  return NextResponse.redirect(new URL(`/login?error=${isReset ? "reset" : "auth"}`, origin));
}
