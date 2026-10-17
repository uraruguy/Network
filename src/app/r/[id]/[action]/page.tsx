import type { Metadata } from "next";
import { CalendarClock, Check, LinkIcon } from "lucide-react";
import { AuthScreen, StatusIcon } from "@/components/auth/AuthScreen";
import { dueLabel, formatDay, isSettled, loadLinkedReminder, otherAction, signAlternate, verifyReminderLink } from "../../_lib/reminder-link";
import { ConfirmAction, OpenAppLink } from "./ConfirmAction";

export const metadata: Metadata = { title: "Follow-up", referrer: "no-referrer" };

type Props = { params: Promise<{ id: string; action: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Landing page for the digest's one-click buttons. Opening it changes nothing (mail scanners
 * prefetch links); the owner confirms with a tap, which POSTs the signature back.
 */
export default async function ReminderLinkPage({ params, searchParams }: Props) {
  const { id, action } = await params;
  const sp = await searchParams;
  const exp = typeof sp.exp === "string" ? sp.exp : undefined;
  const sig = typeof sp.sig === "string" ? sp.sig : undefined;

  if (!verifyReminderLink(id, action, exp, sig)) {
    return (
      <AuthScreen
        icon={
          <StatusIcon tone="warning">
            <LinkIcon />
          </StatusIcon>
        }
        title="This link has expired"
        subtitle="E-mail buttons work for 30 days. Open The Network to handle this follow-up."
        footer={<OpenAppLink />}
      />
    );
  }

  const reminder = await loadLinkedReminder(id);
  if (!reminder) {
    return <AuthScreen title="Nothing to do" subtitle="This follow-up no longer exists." footer={<OpenAppLink />} />;
  }

  const first = reminder.personName.split(" ")[0] ?? reminder.personName;
  if (isSettled(reminder)) {
    const done = reminder.status === "done";
    const copy = done
      ? { title: "Done", subtitle: `${first} is off your list.` }
      : reminder.status === "snoozed"
        ? { title: "Snoozed", subtitle: `${first} will be back on ${formatDay(reminder.dueAt)}.` }
        : { title: "All set", subtitle: `Next follow-up with ${first} on ${formatDay(reminder.dueAt)}.` };
    return (
      <AuthScreen
        icon={<StatusIcon tone={done ? "success" : "accent"}>{done ? <Check strokeWidth={2.6} /> : <CalendarClock />}</StatusIcon>}
        title={copy.title}
        subtitle={copy.subtitle}
        footer={<OpenAppLink />}
      />
    );
  }

  return (
    <AuthScreen title={`Follow up with ${first}`} subtitle={reminder.message ?? dueLabel(reminder)}>
      <ConfirmAction
        id={id}
        primary={{ action, exp: Number(exp), sig: sig! }}
        secondary={signAlternate(id, otherAction(action))}
        name={first}
      />
    </AuthScreen>
  );
}
