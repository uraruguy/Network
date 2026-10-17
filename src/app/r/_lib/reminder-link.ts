import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { completeReminder, snoozeReminder } from "@/lib/data/reminders";
import { signAction, verifyAction } from "@/lib/signing";

/**
 * Shared by the e-mail confirm page (/r/<id>/<action>) and its POST endpoint
 * (/api/reminders/<id>/<action>). No session here: the HMAC signature is the authorization, and
 * the reminder's own owner id scopes every write.
 */

export const LINK_ACTIONS = ["done", "snooze"] as const;
export type LinkAction = (typeof LINK_ACTIONS)[number];

export const SNOOZE_DAYS = 7;
/** A reminder not due within this window was already handled (or is not an e-mail's business). */
const SETTLED_AFTER_MS = 20 * 60 * 60 * 1000;
/** Lifetime of the signature minted for the page's secondary button. */
const ALTERNATE_TTL_SECONDS = 60 * 60;

const uuid = z.string().uuid();

export function parseLinkAction(value: string): LinkAction | null {
  return (LINK_ACTIONS as readonly string[]).includes(value) ? (value as LinkAction) : null;
}

export const otherAction = (action: LinkAction): LinkAction => (action === "done" ? "snooze" : "done");

/** Validates the link's shape and signature. Never throws. */
export function verifyReminderLink(id: string, action: string, exp: unknown, sig: unknown): action is LinkAction {
  if (!uuid.safeParse(id).success || !parseLinkAction(action)) return false;
  const expNum = typeof exp === "number" ? exp : typeof exp === "string" && /^\d{1,12}$/.test(exp) ? Number(exp) : NaN;
  if (typeof sig !== "string") return false;
  try {
    return verifyAction([id, action], expNum, sig);
  } catch {
    return false;
  }
}

/** A fresh short-lived signature for the other action on the same reminder (page's second button). */
export function signAlternate(id: string, action: LinkAction) {
  return { action, ...signAction([id, action], ALTERNATE_TTL_SECONDS) };
}

export type LinkedReminder = {
  id: string;
  ownerId: string;
  status: "pending" | "sent" | "done" | "snoozed";
  dueAt: Date;
  message: string | null;
  personName: string;
};

export async function loadLinkedReminder(id: string): Promise<LinkedReminder | null> {
  const [row] = await db
    .select({
      id: schema.reminders.id,
      ownerId: schema.reminders.ownerId,
      status: schema.reminders.status,
      dueAt: schema.reminders.dueAt,
      message: schema.reminders.message,
      personName: schema.people.displayName,
      personDeletedAt: schema.people.deletedAt,
    })
    .from(schema.reminders)
    .innerJoin(schema.people, eq(schema.people.id, schema.reminders.personId))
    .where(eq(schema.reminders.id, id))
    .limit(1);
  if (!row || row.personDeletedAt) return null;
  const { personDeletedAt: _deleted, ...reminder } = row;
  return reminder;
}

/**
 * True when there's nothing left to do from the e-mail: completed, or no longer due (already
 * snoozed, or a recurring follow-up that moved on). Makes double taps and replays harmless.
 */
export function isSettled(r: Pick<LinkedReminder, "status" | "dueAt">, now = Date.now()): boolean {
  return r.status === "done" || r.dueAt.getTime() > now + SETTLED_AFTER_MS;
}

const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });

/** "Tue, 14 Oct". */
export const formatDay = (d: Date) => dayFmt.format(d);

/** Subtitle when the reminder has no message of its own: "Due today" / "Overdue since Tue, 14 Oct". */
export function dueLabel(r: Pick<LinkedReminder, "dueAt">, now = Date.now()): string {
  return r.dueAt.getTime() < now - 24 * 60 * 60 * 1000 ? `Overdue since ${formatDay(r.dueAt)}` : "Due today";
}

export async function applyLinkAction(r: LinkedReminder, action: LinkAction) {
  return action === "done" ? completeReminder(r.ownerId, r.id) : snoozeReminder(r.ownerId, r.id, SNOOZE_DAYS);
}
