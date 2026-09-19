import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { serverEnv } from "@/lib/env";

/**
 * Capture endpoint for the "Send to The Network" iPhone Shortcut (and anything else that can POST).
 * Auth: Bearer <INBOX_TOKEN>. Body: { text, source? }. Items land in the Inbox for AI triage.
 */
const body = z.object({ text: z.string().trim().min(1).max(20000), source: z.string().max(40).optional() });

export async function POST(req: Request) {
  const token = serverEnv().INBOX_TOKEN;
  const auth = req.headers.get("authorization") ?? "";
  if (!token || auth !== `Bearer ${token}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Body must be { text }" }, { status: 400 });

  // Single-owner app: the inbox belongs to the (only) profile.
  const owner = await db.query.profiles.findFirst({ columns: { id: true } });
  if (!owner) return NextResponse.json({ error: "No owner" }, { status: 500 });
  const [item] = await db.insert(schema.inboxItems).values({ ownerId: owner.id, text: parsed.data.text, source: parsed.data.source ?? "shortcut" }).returning({ id: schema.inboxItems.id });
  return NextResponse.json({ ok: true, id: item!.id, message: "Saved to The Network inbox" });
}
