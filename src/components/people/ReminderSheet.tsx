"use client";
import { useState } from "react";
import { GlassButton } from "@/components/glass/GlassButton";
import { Field, GlassInput } from "@/components/glass/GlassInput";
import { GlassSheet } from "@/components/glass/GlassSheet";
import { RECURRENCE } from "@/lib/db/schema";
import { useCreateReminder } from "@/lib/queries/reminders";
import { cn } from "@/lib/utils";

const QUICK = [
  { label: "Tomorrow", days: 1 },
  { label: "In a week", days: 7 },
  { label: "In 2 weeks", days: 14 },
  { label: "In a month", days: 30 },
  { label: "In 3 months", days: 90 },
  { label: "In 6 months", days: 180 },
];

const REC_LABEL: Record<(typeof RECURRENCE)[number], string> = {
  none: "Once",
  monthly: "Monthly",
  quarterly: "Every 3 months",
  semiannual: "Every 6 months",
  yearly: "Yearly",
  custom_days: "Custom",
};

function plusDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function ReminderSheet({ personId, personName, open, onClose }: { personId: string; personName: string; open: boolean; onClose: () => void }) {
  const [date, setDate] = useState(plusDays(30));
  const [message, setMessage] = useState("");
  const [recurrence, setRecurrence] = useState<(typeof RECURRENCE)[number]>("none");
  const [customDays, setCustomDays] = useState(45);
  const create = useCreateReminder();

  const submit = () => {
    const due = new Date(date + "T09:00:00");
    create.mutate(
      { personId, dueAt: due.toISOString(), message: message.trim() || null, recurrence, recurrenceDays: recurrence === "custom_days" ? customDays : null },
      {
        onSuccess: () => {
          onClose();
          setMessage("");
        },
      },
    );
  };

  return (
    <GlassSheet open={open} onClose={onClose} title={`Follow up with ${personName}`} width={480}>
      <div className="space-y-4 pb-2">
        <div className="flex flex-wrap gap-2">
          {QUICK.map((q) => {
            const active = date === plusDays(q.days);
            return (
              <button key={q.days} type="button" onClick={() => setDate(plusDays(q.days))} className={cn("pressable h-9 rounded-full px-3.5 text-[13.5px] font-medium", active ? "bg-accent text-accent-fg" : "glass text-fg-2")}>
                {q.label}
              </button>
            );
          })}
        </div>
        <Field label="On">
          <GlassInput type="date" value={date} min={plusDays(0)} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Why" hint="What do you want to say or ask?">
          <GlassInput value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Ask how the Berlin move went…" />
        </Field>
        <Field label="Repeat">
          <div className="flex flex-wrap gap-2">
            {RECURRENCE.map((r) => (
              <button key={r} type="button" onClick={() => setRecurrence(r)} className={cn("pressable h-8 rounded-full px-3 text-[13px] font-medium", recurrence === r ? "bg-accent-soft text-accent-strong ring-1 ring-accent/40" : "bg-fg/6 text-fg-2")}>
                {REC_LABEL[r]}
              </button>
            ))}
          </div>
        </Field>
        {recurrence === "custom_days" && (
          <Field label="Every N days">
            <GlassInput type="number" min={1} value={customDays} onChange={(e) => setCustomDays(Number(e.target.value) || 1)} />
          </Field>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <GlassButton variant="ghost" onClick={onClose}>Cancel</GlassButton>
          <GlassButton variant="primary" onClick={submit} disabled={create.isPending || !date}>{create.isPending ? "Saving…" : "Set reminder"}</GlassButton>
        </div>
      </div>
    </GlassSheet>
  );
}
