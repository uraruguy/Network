"use client";
import Link from "next/link";
import { Bell, Check, Clock, Repeat, Trash2 } from "lucide-react";
import { Avatar } from "@/components/glass/Avatar";
import { useDeleteReminder, useReminderAction, type ReminderWithPerson } from "@/lib/queries/reminders";
import { useNow } from "@/lib/hooks";
import { cn, formatDate, formatRelative } from "@/lib/utils";

export function ReminderRow({ r, showPerson = true }: { r: ReminderWithPerson; showPerson?: boolean }) {
  const act = useReminderAction();
  const del = useDeleteReminder();
  const now = useNow();
  const due = new Date(r.dueAt);
  const overdue = due.getTime() < now - 86_400_000;
  const today = !overdue && due.toDateString() === new Date(now).toDateString();
  return (
    <div className="flex items-center gap-3 rounded-[16px] px-3 py-2.5">
      {showPerson ? (
        <Link href={`/people/${r.person.id}`} className="shrink-0"><Avatar name={r.person.displayName} src={r.person.avatarUrl} size={40} /></Link>
      ) : (
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-strong"><Bell size={17} /></span>
      )}
      <div className="min-w-0 flex-1">
        {showPerson && <Link href={`/people/${r.person.id}`} className="block truncate text-[15px] font-semibold tracking-tight">{r.person.displayName}</Link>}
        <p className={cn("truncate text-[13.5px]", showPerson ? "text-fg-2" : "text-fg font-medium")}>{r.message || "Check in"}</p>
        <p className={cn("mt-0.5 flex items-center gap-1.5 text-[12px]", overdue ? "text-danger" : today ? "text-accent-strong" : "text-fg-3")}>
          <Clock size={11} /> {overdue ? `Overdue · ${formatRelative(due)}` : today ? "Today" : formatDate(due)}
          {r.recurrence !== "none" && <Repeat size={11} className="ml-1" />}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button aria-label="Snooze a week" title="Snooze 1 week" onClick={() => act.mutate({ id: r.id, action: "snooze", days: 7 })} className="pressable grid h-9 w-9 place-items-center rounded-full text-fg-3 hover:bg-fg/6">
          <Clock size={16} />
        </button>
        <button aria-label="Done" title="Done" onClick={() => act.mutate({ id: r.id, action: "done" })} className="pressable grid h-9 w-9 place-items-center rounded-full bg-accent-soft text-accent-strong hover:brightness-95">
          <Check size={17} strokeWidth={2.5} />
        </button>
        {!showPerson && (
          <button aria-label="Delete" onClick={() => del.mutate({ id: r.id, personId: r.person.id })} className="pressable grid h-9 w-9 place-items-center rounded-full text-fg-3 hover:bg-danger/10 hover:text-danger">
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </div>
  );
}
