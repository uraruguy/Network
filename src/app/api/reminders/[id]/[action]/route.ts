import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { completeReminder, snoozeReminder } from "@/lib/data/reminders";
import { verifyAction } from "@/lib/signing";

/** One-click actions from the digest email. Signed, expiring, no session needed. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await ctx.params;
  const url = new URL(req.url);
  const exp = Number(url.searchParams.get("exp"));
  const sig = url.searchParams.get("sig") ?? "";
  if (!["done", "snooze"].includes(action) || !verifyAction([id, action], exp, sig)) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 403 });
  }
  const r = await db.query.reminders.findFirst({ where: eq(schema.reminders.id, id) });
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (action === "done") await completeReminder(r.ownerId, id);
  else await snoozeReminder(r.ownerId, id, 7);
  const base = process.env.NEXT_PUBLIC_APP_URL ?? url.origin;
  return NextResponse.redirect(`${base}/today?did=${action}`, 303);
}
