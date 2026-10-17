"use client";
import { addMonths, addWeeks, startOfDay, startOfWeek } from "date-fns";
import { CalendarDays, Check, Clock, Pencil, Repeat, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/glass/Avatar";
import { dueLabel, fromDueAt, nextOccurrence, repeatLabel, toDueAt } from "@/components/followups/recurrence";
import { FollowUpSheet } from "@/components/followups/FollowUpSheet";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { Calendar } from "@/components/ui/date/Calendar";
import { toISODate, WEEK_STARTS_ON } from "@/components/ui/date/presets";
import { IconButton } from "@/components/ui/IconButton";
import { Menu, type MenuItem } from "@/components/ui/Menu";
import { ResponsivePopover } from "@/components/ui/ResponsivePopover";
import { toast } from "@/components/ui/Toast";
import { useNow } from "@/lib/clock";
import { formatDate, formatShortDate } from "@/lib/format";
import { spring } from "@/lib/motion";
import { useReminderWrites, type AnyReminder, type ReminderSnapshot } from "@/lib/queries/reminders";
import { cn } from "@/lib/utils";

type Props = {
  r: AnyReminder;
  /** Show who it's for (Today lists). On a person's page leave it off. */
  showPerson?: boolean;
  /** Name for the edit sheet when the row has no `person` (person page). */
  personName?: string;
  className?: string;
};

const TONE = { overdue: "text-danger", today: "text-accent-text", soon: "text-fg-2", later: "text-fg-3" } as const;

const snapshot = (r: AnyReminder): ReminderSnapshot => ({
  id: r.id,
  personId: r.personId,
  noteId: r.noteId,
  dueAt: new Date(r.dueAt).toISOString(),
  message: r.message,
  recurrence: r.recurrence,
  recurrenceDays: r.recurrenceDays,
});

/**
 * One follow-up, Reminders-style: tap the circle to complete (check pops, row folds away, Undo
 * in a toast; repeating ones roll to the next date), Snooze menu on the right, tap the text to
 * edit. Long-press / right-click for Edit · Done · Delete.
 */
export function ReminderRow({ r, showPerson = true, personName, className }: Props) {
  const now = useNow();
  const writes = useReminderWrites();
  const [phase, setPhase] = useState<"idle" | "checked" | "folding">("idle");
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A completion still animating when the row unmounts (navigation) is sent right away.
  const pending = useRef<ReminderSnapshot | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (pending.current) writes.done(pending.current);
    },
    [writes],
  );

  const person = "person" in r ? r.person : null;
  const name = person?.displayName ?? personName ?? "";
  const first = name.split(/\s+/)[0] ?? name;
  const due = dueLabel(r.dueAt, now);
  const repeat = repeatLabel(r.recurrence, r.recurrenceDays);
  const title = r.message || (showPerson ? "Check in" : `Check in with ${first || "them"}`);
  const recurring = r.recurrence !== "none";

  const complete = () => {
    if (phase !== "idle") return;
    const snap = snapshot(r);
    pending.current = snap;
    setPhase("checked");
    timer.current = setTimeout(() => {
      if (recurring) {
        pending.current = null;
        writes.done(snap);
        setPhase("idle");
        const next = nextOccurrence(new Date(), snap.recurrence, snap.recurrenceDays);
        toast.undo(next ? `Done · next ${formatDate(next)}` : "Done", () => writes.undoDone(snap));
      } else setPhase("folding");
    }, 420);
  };

  const onFolded = () => {
    if (phase !== "folding" || !pending.current) return;
    const snap = pending.current;
    pending.current = null;
    writes.done(snap);
    toast.undo(showPerson && first ? `Followed up with ${first}` : "Follow-up done", () => writes.undoDone(snap));
  };

  /** Snooze to a day, keeping the reminder's time of day. */
  const snoozeTo = (day: Date) => {
    const snap = snapshot(r);
    const dueAt = toDueAt(toISODate(day), fromDueAt(r.dueAt).time);
    writes.reschedule(snap, dueAt);
    toast.undo(`Snoozed to ${formatShortDate(day)}`, () => writes.reschedule(snap, new Date(snap.dueAt).toISOString()));
  };

  const remove = () => {
    const snap = snapshot(r);
    writes.remove(snap);
    toast.undo("Follow-up deleted", () => writes.restore(snap));
  };

  const today = startOfDay(new Date(now));
  const snoozeItems: MenuItem[] = [
    { label: "Tomorrow", icon: <Clock />, onSelect: () => snoozeTo(new Date(today.getTime() + 86_400_000)) },
    { label: "Next week", icon: <CalendarDays />, onSelect: () => snoozeTo(addWeeks(startOfWeek(today, { weekStartsOn: WEEK_STARTS_ON }), 1)) },
    { label: "Next month", icon: <CalendarDays />, onSelect: () => snoozeTo(addMonths(today, 1)) },
    "separator",
    { label: "Pick a date…", icon: <CalendarDays />, onSelect: () => setTimeout(() => setPicking(true), 0) },
  ];

  const checked = phase !== "idle";

  return (
    <motion.div
      initial={false}
      animate={phase === "folding" ? { height: 0, opacity: 0 } : { height: "auto", opacity: 1 }}
      transition={phase === "folding" ? { height: { duration: 0.28, ease: [0.32, 0.72, 0, 1] }, opacity: { duration: 0.18 } } : { duration: 0 }}
      onAnimationComplete={onFolded}
      className={cn("overflow-hidden", className)}
    >
      <ContextMenu
        title={title}
        items={[
          { label: "Edit", icon: <Pencil />, onSelect: () => setEditing(true) },
          { label: "Mark as done", icon: <Check />, onSelect: complete },
          "separator",
          { label: "Delete", icon: <Trash2 />, destructive: true, onSelect: remove },
        ]}
      >
        <div className="relative flex min-h-[60px] items-center gap-1 pr-2 pl-1.5">
          {/* Done */}
          <button
            type="button"
            onClick={complete}
            aria-label={`Mark “${title}” as done`}
            aria-pressed={checked}
            className="pressable group/done grid size-11 shrink-0 place-items-center rounded-full outline-offset-0"
          >
            <span
              className={cn(
                "grid size-[22px] place-items-center rounded-full border-[1.5px] transition-colors duration-150",
                checked ? "border-accent-fill bg-accent-fill text-accent-fg" : "border-fg-4 group-hover/done:border-accent",
              )}
            >
              {checked && (
                <motion.span initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.pop} className="grid place-items-center">
                  <Check size={14} strokeWidth={3.2} />
                </motion.span>
              )}
            </span>
          </button>

          {showPerson && person && (
            <Link href={`/people/${person.id}`} className="pressable mr-2 shrink-0 rounded-full" aria-label={person.displayName} tabIndex={-1}>
              <Avatar name={person.displayName} src={person.avatarUrl} size={36} />
            </Link>
          )}

          {/* Text → edit */}
          <button type="button" onClick={() => setEditing(true)} className="min-w-0 flex-1 py-2 text-left outline-offset-2" aria-label={`Edit follow-up: ${title}, ${due.text}`}>
            {showPerson && person ? (
              <>
                <span className={cn("block truncate text-body font-medium transition-colors", checked && "text-fg-3")}>{person.displayName}</span>
                <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-footnote">
                  <span className={cn("shrink-0 font-medium", TONE[due.tone])}>{due.text}</span>
                  {repeat && <Repeat size={11} strokeWidth={2.4} className="shrink-0 text-fg-3" aria-label={repeat} />}
                  <span className="truncate text-fg-2">· {title}</span>
                </span>
              </>
            ) : (
              <>
                <span className={cn("block truncate text-body transition-colors", checked && "text-fg-3")}>{title}</span>
                <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-footnote">
                  <span className={cn("shrink-0 font-medium", TONE[due.tone])}>{due.text}</span>
                  {repeat && (
                    <span className="flex min-w-0 items-center gap-1 text-fg-3">
                      <Repeat size={11} strokeWidth={2.4} aria-hidden />
                      <span className="truncate">{repeat}</span>
                    </span>
                  )}
                </span>
              </>
            )}
          </button>

          {/* Snooze */}
          <Menu
            title="Snooze until"
            items={snoozeItems}
            trigger={<IconButton label="Snooze" variant="plain" size="md" icon={<Clock strokeWidth={2.2} />} disabled={checked} />}
          />
          <ResponsivePopover
            title="Snooze until"
            open={picking}
            onOpenChange={setPicking}
            align="end"
            className="w-[340px] p-3"
            trigger={<button type="button" tabIndex={-1} aria-hidden className="pointer-events-none absolute top-1/2 right-4 size-px opacity-0" />}
          >
            {(close) => (
              <Calendar
                value={null}
                min={new Date(now)}
                onChange={(d) => {
                  close();
                  snoozeTo(d);
                }}
              />
            )}
          </ResponsivePopover>
        </div>
      </ContextMenu>
      <FollowUpSheet open={editing} onOpenChange={setEditing} personId={r.personId} personName={name} reminderId={r.id} />
    </motion.div>
  );
}
