"use client";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Check, CircleCheck } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useRef, useState } from "react";
import { Avatar } from "@/components/glass/Avatar";
import { ListSkeleton } from "@/components/skeletons/parts";
import { NAV_FORWARD } from "@/components/shell/transitions";
import { toast } from "@/components/ui/Toast";
import { useNow } from "@/lib/clock";
import { formatRelative, formatShortDate } from "@/lib/format";
import { duration, ease, spring, useMotionSafe } from "@/lib/motion";
import { useQueryReady } from "@/lib/offline/useCacheReady";
import { keys } from "@/lib/queries/keys";
import { useReminders, useReminderWrites, type ReminderSnapshot, type ReminderWithPerson } from "@/lib/queries/reminders";
import type { Stats } from "@/lib/queries/types";
import { cn } from "@/lib/utils";
import { Section } from "./Section";
import { daysOverdue, splitReminders, startOfDay, weekHorizon } from "./today-data";

const rowKey = (r: Pick<ReminderWithPerson, "id" | "dueAt">) => `${r.id}@${new Date(r.dueAt).toISOString()}`;
/** Time the check mark gets to pop before the write (and its optimistic removal) goes out. */
const POP_MS = 380;

/** "Due" (overdue + today) and "This week", with one-tap completion + undo. */
export function FollowUps() {
  const now = useNow();
  const qc = useQueryClient();
  const reminders = useReminders({ until: weekHorizon(now).toISOString() });
  const ready = useQueryReady(reminders);
  const data = ready ? reminders.data : undefined;
  // Optimistic, offline-safe writes serialised per reminder (done -> undo stay in order).
  const writes = useReminderWrites();
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const mark = useCallback((key: string, on: boolean) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  // The tile updates instantly; the writes' settle refetches the real numbers.
  const bumpStats = useCallback(
    (r: ReminderWithPerson, delta: number) => {
      const overdue = new Date(r.dueAt).getTime() < startOfDay(Date.now()).getTime();
      qc.setQueryData<Stats>(keys.stats(), (s) =>
        s ? { ...s, overdue: Math.max(0, s.overdue + (overdue ? delta : 0)), dueToday: Math.max(0, s.dueToday + (overdue ? 0 : delta)) } : s,
      );
    },
    [qc],
  );

  const complete = useCallback(
    (r: ReminderWithPerson) => {
      const key = rowKey(r);
      const snapshot: ReminderSnapshot = {
        id: r.id,
        personId: r.personId,
        noteId: r.noteId,
        message: r.message,
        recurrence: r.recurrence,
        recurrenceDays: r.recurrenceDays,
        dueAt: r.dueAt,
      };
      mark(key, true);
      bumpStats(r, -1);
      // Let the check pop first; the optimistic "done" then removes the row, which folds away.
      timers.current.set(
        key,
        setTimeout(() => {
          timers.current.delete(key);
          writes.done(snapshot);
        }, POP_MS),
      );
      toast.undo(
        <>
          Done · <span className="font-normal text-fg-2">{r.person.displayName}</span>
        </>,
        () => {
          bumpStats(r, +1);
          mark(key, false);
          const pending = timers.current.get(key);
          if (pending) {
            // Undone before anything was sent.
            clearTimeout(pending);
            timers.current.delete(key);
            return;
          }
          writes.undoDone(snapshot);
        },
        { description: r.message || undefined },
      );
    },
    [bumpStats, mark, writes],
  );

  const loading = !ready;
  const { due, week } = splitReminders(data ?? [], now);

  return (
    <>
      <Section id="due" title="Due" count={due.length}>
        {loading ? (
          <div className="ui-skeleton-reveal" role="status" aria-label="Loading follow-ups">
            <ListSkeleton rows={3} />
          </div>
        ) : due.length === 0 ? (
          <AllClear weekCount={week.length} />
        ) : (
          <ReminderList rows={due} now={now} checked={checked} onComplete={complete} />
        )}
      </Section>
      {!loading && week.length > 0 && (
        <Section id="week" title="This week" count={week.length} className="mt-8">
          <ReminderList rows={week} now={now} checked={checked} onComplete={complete} upcoming />
        </Section>
      )}
    </>
  );
}

function AllClear({ weekCount }: { weekCount: number }) {
  return (
    <div className="surface flex items-center gap-3.5 rounded-lg px-4 py-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-success-soft text-success" aria-hidden>
        <CircleCheck size={22} strokeWidth={2.2} />
      </span>
      <div className="min-w-0">
        <p className="text-headline text-fg">You&apos;re all caught up</p>
        <p className="text-subhead text-fg-2">{weekCount ? "Nothing due today — the week ahead is below." : "Open a person and tap Follow up to plan a touch."}</p>
      </div>
    </div>
  );
}

type ListProps = { rows: ReminderWithPerson[]; now: number; checked: ReadonlySet<string>; onComplete: (r: ReminderWithPerson) => void; upcoming?: boolean };

function ReminderList({ rows, now, checked, onComplete, upcoming }: ListProps) {
  const safe = useMotionSafe();
  return (
    <ul className="surface overflow-hidden rounded-lg">
      <AnimatePresence initial={false}>
        {rows.map((r) => (
          <motion.li
            key={rowKey(r)}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1, transition: { height: spring.smooth, opacity: { duration: duration.base } } }}
            exit={{
              height: 0,
              opacity: 0,
              transition: safe ? { height: { duration: duration.slow, ease: ease.ios }, opacity: { duration: duration.base } } : { duration: 0 },
            }}
            className="relative overflow-hidden before:absolute before:top-0 before:right-0 before:left-[108px] before:h-[0.5px] before:bg-separator first:before:hidden"
          >
            <ReminderItem r={r} now={now} checked={checked.has(rowKey(r))} onComplete={onComplete} upcoming={upcoming} />
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

function dueLabel(dueAt: string | Date, now: number, upcoming?: boolean) {
  const late = daysOverdue(dueAt, now);
  if (upcoming) {
    if (late === -1) return { text: "Tomorrow", tone: "text-fg-3" };
    return { text: formatShortDate(dueAt, now), tone: "text-fg-3" };
  }
  if (late <= 0) return { text: "Today", tone: "text-accent-text" };
  if (late === 1) return { text: "Yesterday", tone: "text-danger" };
  if (late < 30) return { text: `${late} days ago`, tone: "text-danger" };
  return { text: formatRelative(startOfDay(new Date(dueAt)), startOfDay(now)), tone: "text-danger" };
}

function ReminderItem({ r, now, checked, onComplete, upcoming }: { r: ReminderWithPerson; now: number; checked: boolean; onComplete: (r: ReminderWithPerson) => void; upcoming?: boolean }) {
  const label = dueLabel(r.dueAt, now, upcoming);
  return (
    <div className="flex min-h-[64px] items-center pr-4 pl-1.5">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={`Done: ${r.message || "Check in"} — ${r.person.displayName}`}
        disabled={checked}
        onClick={() => onComplete(r)}
        className="group grid size-11 shrink-0 place-items-center rounded-full outline-none"
      >
        <motion.span
          animate={checked ? { scale: [1, 1.22, 1] } : { scale: 1 }}
          // Keyframed pop: springs only take two keyframes.
          transition={{ duration: 0.34, times: [0, 0.38, 1], ease: ease.out }}
          className={cn(
            "grid size-[24px] place-items-center rounded-full border-[1.5px] transition-colors duration-200 group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-[var(--focus-ring)]",
            checked ? "border-accent-fill bg-accent-fill text-accent-fg" : "border-fg-4 [@media(hover:hover)]:group-hover:border-accent",
          )}
        >
          <motion.span initial={false} animate={checked ? { scale: 1, opacity: 1 } : { scale: 0.5, opacity: 0 }} transition={spring.pop}>
            <Check size={14} strokeWidth={3} aria-hidden />
          </motion.span>
        </motion.span>
      </button>
      <Link
        href={`/people/${r.person.id}`}
        transitionTypes={NAV_FORWARD}
        className="flex min-w-0 flex-1 items-center gap-3 self-stretch rounded-sm py-2.5 outline-none focus-visible:bg-fill-1"
      >
        <Avatar name={r.person.displayName} src={r.person.avatarUrl} size={40} />
        <span className={cn("min-w-0 flex-1 transition-opacity duration-300", checked && "opacity-50")}>
          <span className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-headline text-fg">{r.person.displayName}</span>
            <span className={cn("shrink-0 text-footnote", label.tone)} suppressHydrationWarning>
              {label.text}
            </span>
          </span>
          <span className="block truncate text-subhead text-fg-2">{r.message || "Check in"}</span>
        </span>
      </Link>
    </div>
  );
}

