import { withOwner, parseBody } from "@/lib/api-server";
import { createReminder, listReminders } from "@/lib/data/reminders";
import { reminderInput } from "@/lib/schemas";

export const GET = withOwner(async ({ ownerId, url }) => {
  const until = url.searchParams.get("until");
  const personId = url.searchParams.get("person") ?? undefined;
  return listReminders(ownerId, { until: until ? new Date(until) : undefined, personId });
});

export const POST = withOwner(async ({ ownerId, req }) => createReminder(ownerId, await parseBody(req, reminderInput)));
