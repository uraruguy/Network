import { NextResponse } from "next/server";
import { runDigest } from "@/lib/data/digest";
import { serverEnv } from "@/lib/env";

export const maxDuration = 60;

function authorized(req: Request) {
  const secret = serverEnv().CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  const header = req.headers.get("x-cron-secret");
  const url = new URL(req.url);
  return auth === `Bearer ${secret}` || header === secret || url.searchParams.get("secret") === secret;
}

async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  if (url.searchParams.get("preview") === "1") {
    const [first] = await runDigest({ preview: true });
    return new Response(first?.html ?? "<p>No profile</p>", { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  const results = await runDigest({ force });
  return NextResponse.json({ ok: true, at: new Date().toISOString(), results });
}

export const GET = handle;
export const POST = handle;
