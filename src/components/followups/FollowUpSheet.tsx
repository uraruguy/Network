"use client";
import type { Recurrence } from "@/lib/constants";

/**
 * App-native follow-up chooser in a sheet: preset chips, inline calendar, optional time, repeat.
 * Creates (or, with `reminderId`, edits) the reminder itself. (Contract stub; the Person track implements it.)
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

export function FollowUpSheet(_props: FollowUpSheetProps) {
  return null;
}
