import { NextResponse } from "next/server";
import { z } from "zod";
import { notFound, parseBody, parseQuery, withOwner } from "@/lib/api-server";
import { createReminder, listReminders } from "@/lib/data/reminders";
import { reminderInput } from "@/lib/schemas";

const query = z.object({ until: z.coerce.date().optional(), person: z.string().uuid().optional() });

/** GET ?until=<iso>&person=<id> → open reminders with their person, soonest first. */
export const GET = withOwner(async ({ ownerId, url }) => {
  const q = parseQuery(url, query);
  return listReminders(ownerId, { until: q.until, personId: q.person });
});

/** Create (optionally linked to the note it came from via `noteId`) → reminder (201). */
export const POST = withOwner(async ({ ownerId, req }) => {
  const reminder = await createReminder(ownerId, await parseBody(req, reminderInput));
  if (!reminder) notFound();
  return NextResponse.json(reminder, { status: 201 });
});
