"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { SkeletonText } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import type { Recurrence } from "@/lib/constants";
import { useProfile } from "@/lib/queries/misc";
import { findCachedReminder, useReminders, useReminderWrites, type AnyReminder } from "@/lib/queries/reminders";
import { FollowUpChooser, type FollowUpValue } from "./FollowUpChooser";
import { digestTime, followUpSummary, fromDueAt, fromRecurrence, NO_REPEAT, toDueAt, toRecurrence } from "./recurrence";

/**
 * App-native follow-up chooser in a sheet: preset chips, inline calendar, optional time, repeat.
 * Creates (or, with `reminderId`, edits) the reminder itself — optimistically and offline-safe.
 */
export type FollowUpDraft = { dueAt: string; message: string | null; recurrence: Recurrence; recurrenceDays: number | null; noteId: string | null };

export type FollowUpSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personId: string;
  personName: string;
  /** Link the follow-up to a note (per-note bell). */
  noteId?: string | null;
  defaultMessage?: string;
  /** Edit an existing reminder instead of creating one. */
  reminderId?: string;
  onSaved?: (draft: FollowUpDraft) => void;
};

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

function valueFromReminder(r: AnyReminder, digest: string): FollowUpValue {
  const { date, time } = fromDueAt(r.dueAt);
  return { date, time: time === digest ? null : time, repeat: fromRecurrence(r.recurrence, r.recurrenceDays), message: r.message ?? "" };
}

export function FollowUpSheet({ open, onOpenChange, personId, personName, noteId, defaultMessage, reminderId, onSaved }: FollowUpSheetProps) {
  const qc = useQueryClient();
  const writes = useReminderWrites();
  const { data: profile } = useProfile();
  const digest = digestTime(profile?.digestHour);
  const editing = !!reminderId;

  // Editing a reminder that isn't cached yet (cold start): fetch this person's open reminders.
  const cached = editing && open ? findCachedReminder(qc, reminderId, personId) : undefined;
  const fallback = useReminders({ personId }, { enabled: editing && open && !cached });
  const source = cached ?? (editing ? fallback.data?.find((r) => r.id === reminderId) : undefined);

  const blank = (): FollowUpValue => ({ date: null, time: null, repeat: NO_REPEAT, message: defaultMessage ?? "" });
  const [value, setValue] = useState<FollowUpValue>(blank);
  // Re-initialise on every open (and once an uncached reminder arrives).
  const [initFor, setInitFor] = useState<string | null>(null);
  const initKey = open ? (editing ? (source ? `edit:${reminderId}` : null) : "new") : null;
  if (initKey !== initFor) {
    setInitFor(initKey);
    if (initKey) setValue(editing && source ? valueFromReminder(source, digest) : blank());
  }

  const { recurrence, recurrenceDays } = toRecurrence(value.repeat);
  const summary = followUpSummary({ date: value.date, time: value.time, recurrence, recurrenceDays });
  const first = firstName(personName);

  const save = () => {
    if (!value.date) return false;
    const dueAt = toDueAt(value.date, value.time ?? digest);
    const message = value.message.trim() || null;
    const draft: FollowUpDraft = { dueAt, message, recurrence, recurrenceDays, noteId: noteId ?? null };
    if (editing) writes.update({ id: reminderId, personId }, { dueAt, message, recurrence, recurrenceDays });
    else writes.create({ personId, noteId: noteId ?? null, dueAt, message, recurrence, recurrenceDays });
    onSaved?.(draft);
    toast.success(editing ? "Follow-up updated" : `Follow up with ${first}`, { description: summary, duration: 3000 });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Edit follow-up" : `Follow up with ${first}`}
      description={<span className="tabular-nums">{summary}</span>}
      cancel
      done={editing ? "Save" : "Add"}
      doneDisabled={!value.date}
      onDone={save}
      width={480}
    >
      {editing && !source ? (
        <SkeletonText lines={6} className="py-4" />
      ) : (
        <FollowUpChooser value={value} onChange={setValue} digestHour={profile?.digestHour} messagePlaceholder={`What to talk to ${first} about? (optional)`} className="pt-2" />
      )}
    </Sheet>
  );
}
