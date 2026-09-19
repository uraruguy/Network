"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ReminderWithPerson } from "@/lib/data/reminders";
import type { ReminderInput } from "@/lib/schemas";
import { keys } from "./keys";

export type { ReminderWithPerson };

export function useReminders(opts: { until?: string; personId?: string } = {}) {
  const p = new URLSearchParams();
  if (opts.until) p.set("until", opts.until);
  if (opts.personId) p.set("person", opts.personId);
  const qs = p.toString();
  return useQuery({ queryKey: ["reminders", opts], queryFn: () => api.get<ReminderWithPerson[]>(`/api/reminders${qs ? `?${qs}` : ""}`) });
}

function useInvalidate() {
  const qc = useQueryClient();
  return (personId?: string) => {
    qc.invalidateQueries({ queryKey: ["reminders"] });
    qc.invalidateQueries({ queryKey: ["people"] });
    if (personId) qc.invalidateQueries({ queryKey: keys.person(personId) });
  };
}

export function useCreateReminder() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (input: ReminderInput) => api.post<ReminderWithPerson>("/api/reminders", input), onSuccess: (r) => inv(r.personId) });
}

export function useReminderAction() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; action: "done" } | { id: string; action: "snooze"; days: number }) => api.patch<ReminderWithPerson>(`/api/reminders/${id}`, body),
    onSuccess: (r) => inv(r.personId),
  });
}

export function useDeleteReminder() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: ({ id }: { id: string; personId: string }) => api.delete(`/api/reminders/${id}`), onSuccess: (_d, v) => inv(v.personId) });
}
