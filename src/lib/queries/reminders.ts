"use client";
import { useMutation, useQuery, type QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ReminderWithPerson } from "@/lib/data/reminders";
import type { ReminderAction, ReminderInput } from "@/lib/schemas";
import { keys } from "./keys";

export type { ReminderWithPerson };

export function useReminders(opts: { until?: string; personId?: string } = {}) {
  const p = new URLSearchParams();
  if (opts.until) p.set("until", opts.until);
  if (opts.personId) p.set("person", opts.personId);
  const qs = p.toString();
  return useQuery({ queryKey: keys.reminders(opts), queryFn: () => api.get<ReminderWithPerson[]>(`/api/reminders${qs ? `?${qs}` : ""}`) });
}

export const REMINDER_MUT = {
  create: ["reminders", "create"] as const,
  action: ["reminders", "action"] as const,
  delete: ["reminders", "delete"] as const,
};

function invalidate(qc: QueryClient, personId?: string) {
  qc.invalidateQueries({ queryKey: ["reminders"] });
  qc.invalidateQueries({ queryKey: ["people"] });
  qc.invalidateQueries({ queryKey: keys.stats() });
  if (personId) qc.invalidateQueries({ queryKey: keys.person(personId) });
}

export function registerReminderMutations(qc: QueryClient) {
  qc.setMutationDefaults(REMINDER_MUT.create, {
    mutationFn: (input: ReminderInput) => api.post<ReminderWithPerson>("/api/reminders", input),
    onSuccess: (r: ReminderWithPerson) => invalidate(qc, r.personId),
  });
  qc.setMutationDefaults(REMINDER_MUT.action, {
    mutationFn: ({ id, ...body }: { id: string } & ReminderAction) => api.patch<ReminderWithPerson>(`/api/reminders/${id}`, body),
    onSuccess: (r: ReminderWithPerson) => invalidate(qc, r.personId),
  });
  qc.setMutationDefaults(REMINDER_MUT.delete, {
    mutationFn: ({ id }: { id: string; personId: string }) => api.delete(`/api/reminders/${id}`),
    onSuccess: (_d: unknown, v: { id: string; personId: string }) => invalidate(qc, v.personId),
  });
}

export function useCreateReminder() {
  return useMutation<ReminderWithPerson, Error, ReminderInput>({ mutationKey: REMINDER_MUT.create });
}

/** done | snooze {days} | reschedule {dueAt} */
export function useReminderAction() {
  return useMutation<ReminderWithPerson, Error, { id: string } & ReminderAction>({ mutationKey: REMINDER_MUT.action });
}

export function useDeleteReminder() {
  return useMutation<unknown, Error, { id: string; personId: string }>({ mutationKey: REMINDER_MUT.delete });
}
