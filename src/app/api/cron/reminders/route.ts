import { NextResponse } from "next/server";
import { runDigest } from "@/lib/data/digest";
import { serverEnv } from "@/lib/env";
import { bearerToken, safeEqual } from "@/lib/security/compare";

export const maxDuration = 60;

/**
 * Daily digest trigger. Callers: Vercel Cron and Supabase pg_cron (`private.ping_digest`), both
 * sending `Authorization: Bearer <CRON_SECRET>`. Secrets in query strings are not accepted (they
 * end up in logs and browser history); the preview lives at /api/digest/preview for the owner.
 */
function authorized(req: Request) {
  const secret = serverEnv().CRON_SECRET;
  return !!secret && safeEqual(bearerToken(req.headers.get("authorization")), secret);
}

async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthenticated", message: "Unauthorized" }, { status: 401 });
  const force = new URL(req.url).searchParams.get("force") === "1";
  const results = await runDigest({ force });
  // Per-recipient outcome without addresses: this response may be logged by the scheduler.
  return NextResponse.json(
    { ok: true, at: new Date().toISOString(), results: results.map(({ sent, reason, count }) => ({ sent, reason, count })) },
    { headers: { "cache-control": "no-store" } },
  );
}

export const GET = handle;
export const POST = handle;
