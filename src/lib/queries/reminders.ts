"use client";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { addDays, startOfDay } from "date-fns";
import { nextOccurrence } from "@/components/followups/recurrence";
import { toast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import type { ReminderWithPerson } from "@/lib/data/reminders";
import type { ReminderAction, ReminderInput } from "@/lib/schemas";
import { keys } from "./keys";
import { applyChange, earliestDue, findIn, type ListFilter, type ReminderChange, type ReminderLike, type ReminderPatch } from "./reminders-cache";
import type { PersonDetailApi, PersonIndexRow } from "./types";
import { noteEntity, ParentPendingError, personEntity, reminderEntity, scopeFor, waitForParent } from "./write-order";

export type { ReminderWithPerson };
/** An open reminder as embedded in a person's detail (no `person`). */
export type OpenReminder = PersonDetailApi["reminders"][number];
/** Either row shape — what `ReminderRow` renders. */
export type AnyReminder = OpenReminder | ReminderWithPerson;
export type ReminderPerson = ReminderWithPerson["person"];

/* ---------- reads ---------- */

export function useReminders(opts: { until?: string; personId?: string } = {}, query: { enabled?: boolean } = {}) {
  const p = new URLSearchParams();
  if (opts.until) p.set("until", opts.until);
  if (opts.personId) p.set("person", opts.personId);
  const qs = p.toString();
  return useQuery({ queryKey: keys.reminders(opts), queryFn: () => api.get<ReminderWithPerson[]>(`/api/reminders${qs ? `?${qs}` : ""}`), enabled: query.enabled ?? true });
}

/** Finds a reminder in any cached list (person details and Today lists). */
export function findCachedReminder(qc: QueryClient, id: string, personId?: string): AnyReminder | undefined {
  const lists: (readonly AnyReminder[] | undefined)[] = [];
  if (personId) lists.push(qc.getQueryData<PersonDetailApi>(keys.person(personId))?.reminders);
  for (const [, data] of qc.getQueriesData<ReminderWithPerson[]>({ queryKey: ["reminders"] })) lists.push(data);
  for (const [, data] of qc.getQueriesData<PersonDetailApi>({ queryKey: ["person"] })) lists.push(data?.reminders);
  return findIn(lists, id);
}

/* ---------- optimistic cache plumbing ---------- */

function personFor(qc: QueryClient, personId: string): ReminderPerson | null {
  const d = qc.getQueryData<PersonDetailApi>(keys.person(personId));
  if (d) return { id: d.id, displayName: d.displayName, avatarUrl: d.avatarUrl, headline: d.headline, company: d.company };
  const row = qc.getQueryData<PersonIndexRow[]>(keys.peopleIndex())?.find((p) => p.id === personId);
  return row ? { id: row.id, displayName: row.displayName, avatarUrl: row.avatarUrl, headline: row.headline, company: row.company } : null;
}

/** Applies one change to every cached list that holds reminders for `personId`. */
export function applyReminderChange(qc: QueryClient, personId: string, change: ReminderChange) {
  // Person detail: open reminders + nextFollowupAt.
  let nextFollowupAt: string | null | undefined;
  qc.setQueryData<PersonDetailApi>(keys.person(personId), (p) => {
    if (!p) return p;
    const reminders = applyChange(p.reminders as unknown as ReminderLike[], change, {}, (r, existing) => ({ ...existing, ...stripPerson(r) }) as ReminderLike);
    nextFollowupAt = earliestDue(reminders);
    return { ...p, reminders, nextFollowupAt } as unknown as PersonDetailApi;
  });
  // Today / per-person lists.
  const person = personFor(qc, personId);
  for (const [key, data] of qc.getQueriesData<ReminderWithPerson[]>({ queryKey: ["reminders"] })) {
    if (!data) continue;
    const filter = (key[1] ?? {}) as ListFilter;
    const next = applyChange(data as unknown as (ReminderLike & { person?: ReminderPerson })[], change, filter, (r, existing) => {
      const p = existing?.person ?? (r.person as ReminderPerson | undefined) ?? person;
      return p ? ({ ...existing, ...r, person: p } as ReminderLike & { person: ReminderPerson }) : null;
    });
    qc.setQueryData(key, next);
  }
  // People index: the row's next follow-up (known exactly when the detail is cached).
  if (nextFollowupAt !== undefined) {
    qc.setQueryData<PersonIndexRow[]>(keys.peopleIndex(), (rows) =>
      rows?.map((r) => (r.id === personId ? ({ ...r, nextFollowupAt } as unknown as PersonIndexRow) : r)),
    );
  }
}

function stripPerson(r: Record<string, unknown>) {
  const { person: _person, ...rest } = r;
  return rest;
}

/** Server truth for everything a reminder touches — skipped while other reminder writes are in flight. */
function settle(qc: QueryClient, personId: string | undefined) {
  if (qc.isMutating({ mutationKey: ["reminders"] }) > 1) return;
  qc.invalidateQueries({ queryKey: ["reminders"] });
  qc.invalidateQueries({ queryKey: keys.peopleIndex() });
  qc.invalidateQueries({ queryKey: keys.stats() });
  if (personId) qc.invalidateQueries({ queryKey: keys.person(personId) });
}

function failed(qc: QueryClient, personId: string | undefined, message: string) {
  return (e: unknown) => {
    toast.error(message, { description: e instanceof Error ? e.message : undefined });
    qc.invalidateQueries({ queryKey: ["reminders"] });
    if (personId) qc.invalidateQueries({ queryKey: keys.person(personId) });
  };
}

/* ---------- mutations ---------- */

export const REMINDER_MUT = {
  create: ["reminders", "create"] as const,
  action: ["reminders", "action"] as const,
  delete: ["reminders", "delete"] as const,
};

export type CreateReminderVars = ReminderInput & { id: string };
export type ReminderActionVars = { id: string; personId?: string } & ReminderAction;
export type DeleteReminderVars = { id: string; personId: string };

/** Local due time for snoozes on the server's terms (`snooze {days}` = that many days ahead, 09:00). */
const snoozeDue = (days: number) => {
  const d = addDays(startOfDay(new Date()), days);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
};

/** The optimistic change an action implies, given the reminder as currently cached. */
function changeForAction(qc: QueryClient, v: ReminderActionVars): ReminderChange | null {
  switch (v.action) {
    case "done": {
      const r = findCachedReminder(qc, v.id, v.personId);
      const next = r ? nextOccurrence(new Date(), r.recurrence, r.recurrenceDays) : null;
      return next ? { type: "patch", id: v.id, patch: { dueAt: next.toISOString(), status: "pending" } } : { type: "remove", id: v.id };
    }
    case "snooze":
      return { type: "patch", id: v.id, patch: { dueAt: snoozeDue(v.days), status: "snoozed" } };
    case "reschedule":
      return { type: "patch", id: v.id, patch: { dueAt: v.dueAt, status: "pending" } };
    case "update": {
      const patch: ReminderPatch = {};
      if (v.dueAt) Object.assign(patch, { dueAt: v.dueAt, status: "pending" });
      if (v.message !== undefined) patch.message = v.message?.trim() ? v.message.trim() : null;
      if (v.recurrence !== undefined) {
        patch.recurrence = v.recurrence;
        patch.recurrenceDays = v.recurrence === "custom_days" ? (v.recurrenceDays ?? 30) : null;
      }
      return { type: "patch", id: v.id, patch };
    }
  }
}

/**
 * Mutation defaults (registered once at startup) so writes made offline survive a reload and
 * replay in order: every write runs in the scope `reminder:<id>`, and the optimistic cache change
 * happens in `onMutate` (skipped when a persisted mutation resumes — its change is already cached).
 */
export function registerReminderMutations(qc: QueryClient) {
  qc.setMutationDefaults<ReminderWithPerson, Error, CreateReminderVars>(REMINDER_MUT.create, {
    mutationFn: (input: CreateReminderVars) =>
      api.post<ReminderWithPerson>("/api/reminders", input).catch((e: unknown) => {
        throw waitForParent(qc, e, personEntity(input.personId));
      }),
    // A 404 while the person's create is still queued waits for it; anything else a few times.
    retry: (count: number, e: Error) => e instanceof ParentPendingError || count < 3,
    onMutate: async (v: CreateReminderVars) => {
      const now = new Date().toISOString();
      applyReminderChange(qc, v.personId, {
        type: "upsert",
        reminder: {
          id: v.id,
          ownerId: "",
          personId: v.personId,
          noteId: v.noteId ?? null,
          dueAt: v.dueAt,
          message: v.message?.trim() ? v.message.trim() : null,
          recurrence: v.recurrence ?? "none",
          recurrenceDays: v.recurrence === "custom_days" ? (v.recurrenceDays ?? 30) : null,
          status: "pending",
          sentAt: null,
          doneAt: null,
          sourceKind: null,
          sourceRef: null,
          createdAt: now,
          updatedAt: now,
        },
      });
    },
    onSuccess: (r: ReminderWithPerson) => applyReminderChange(qc, r.personId, { type: "upsert", reminder: r as unknown as ReminderLike & Record<string, unknown> }),
    onError: (e: unknown, v: CreateReminderVars) => {
      applyReminderChange(qc, v.personId, { type: "remove", id: v.id });
      failed(qc, v.personId, "Couldn’t save the follow-up")(e);
    },
    onSettled: (_d: unknown, _e: unknown, v: CreateReminderVars) => settle(qc, v.personId),
  });
  qc.setMutationDefaults<ReminderWithPerson, Error, ReminderActionVars>(REMINDER_MUT.action, {
    mutationFn: ({ id, personId: _p, ...body }: ReminderActionVars) => api.patch<ReminderWithPerson>(`/api/reminders/${id}`, body),
    onMutate: async (v: ReminderActionVars) => {
      const personId = v.personId ?? findCachedReminder(qc, v.id)?.personId;
      const change = changeForAction(qc, v);
      if (personId && change) applyReminderChange(qc, personId, change);
    },
    onSuccess: (r: ReminderWithPerson) =>
      applyReminderChange(
        qc,
        r.personId,
        r.status === "done" ? { type: "remove", id: r.id } : { type: "upsert", reminder: r as unknown as ReminderLike & Record<string, unknown> },
      ),
    onError: (e: unknown, v: ReminderActionVars) => failed(qc, v.personId, "Couldn’t update the follow-up")(e),
    onSettled: (_d: unknown, _e: unknown, v: ReminderActionVars) => settle(qc, v.personId),
  });
  qc.setMutationDefaults<unknown, Error, DeleteReminderVars>(REMINDER_MUT.delete, {
    mutationFn: ({ id }: DeleteReminderVars) => api.delete(`/api/reminders/${id}`),
    onMutate: async (v: DeleteReminderVars) => applyReminderChange(qc, v.personId, { type: "remove", id: v.id }),
    onError: (e: unknown, v: DeleteReminderVars) => failed(qc, v.personId, "Couldn’t delete the follow-up")(e),
    onSettled: (_d: unknown, _e: unknown, v: DeleteReminderVars) => settle(qc, v.personId),
  });
}

/**
 * Runs a mutation through its registered defaults, serialized with other writes to the same
 * reminder — and behind its note's first save or its person's create while those are queued
 * (see ./write-order), so the server links the note and knows the person.
 */
function run<TData, TVars>(qc: QueryClient, mutationKey: readonly unknown[], variables: TVars, reminderId: string): Promise<TData> {
  const v = variables as { personId?: string; noteId?: string | null };
  const scope = scopeFor(qc, reminderEntity(reminderId), [noteEntity(v.noteId), personEntity(v.personId)]);
  const mutation = qc.getMutationCache().build<TData, Error, TVars, unknown>(qc, { mutationKey, scope: { id: scope } });
  return mutation.execute(variables);
}

const ignore = () => {};

/** Snapshot of a reminder sufficient to re-create it (undo of done/delete). */
export type ReminderSnapshot = Pick<OpenReminder, "id" | "personId" | "noteId" | "message" | "recurrence" | "recurrenceDays"> & { dueAt: string | Date };

/**
 * Fire-and-forget reminder writes: the cache updates instantly, the request runs (or waits for
 * the network) in the background, failures toast and resync.
 */
export function useReminderWrites() {
  const qc = useQueryClient();
  return useMemo(
    () => ({
      /** Creates a follow-up; returns its (client-generated) id. */
      create(input: ReminderInput): string {
        const id = input.id ?? crypto.randomUUID();
        run(qc, REMINDER_MUT.create, { ...input, id }, id).catch(ignore);
        return id;
      },
      done(r: Pick<ReminderSnapshot, "id" | "personId">) {
        run(qc, REMINDER_MUT.action, { id: r.id, personId: r.personId, action: "done" }, r.id).catch(ignore);
      },
      reschedule(r: Pick<ReminderSnapshot, "id" | "personId">, dueAt: string) {
        run(qc, REMINDER_MUT.action, { id: r.id, personId: r.personId, action: "reschedule", dueAt }, r.id).catch(ignore);
      },
      update(r: Pick<ReminderSnapshot, "id" | "personId">, patch: Omit<Extract<ReminderAction, { action: "update" }>, "action">) {
        run(qc, REMINDER_MUT.action, { id: r.id, personId: r.personId, action: "update", ...patch }, r.id).catch(ignore);
      },
      remove(r: Pick<ReminderSnapshot, "id" | "personId">) {
        run(qc, REMINDER_MUT.delete, { id: r.id, personId: r.personId }, r.id).catch(ignore);
      },
      /** Undo for "done": puts the reminder back exactly as it was (re-opens or rolls back the repeat). */
      undoDone(r: ReminderSnapshot) {
        const dueAt = new Date(r.dueAt).toISOString();
        run(qc, REMINDER_MUT.action, { id: r.id, personId: r.personId, action: "reschedule", dueAt }, r.id).catch(ignore);
      },
      /** Undo for "delete": re-creates it with the same id. */
      restore(r: ReminderSnapshot) {
        run(
          qc,
          REMINDER_MUT.create,
          {
            id: r.id,
            personId: r.personId,
            noteId: r.noteId,
            dueAt: new Date(r.dueAt).toISOString(),
            message: r.message,
            recurrence: r.recurrence,
            recurrenceDays: r.recurrenceDays,
          },
          r.id,
        ).catch(ignore);
      },
    }),
    [qc],
  );
}

/* ---------- v1-compatible hooks (same defaults, unscoped) ---------- */

export function useCreateReminder() {
  const m = useMutation<ReminderWithPerson, Error, CreateReminderVars>({ mutationKey: REMINDER_MUT.create });
  return { ...m, mutate: (input: ReminderInput, opts?: Parameters<typeof m.mutate>[1]) => m.mutate({ ...input, id: input.id ?? crypto.randomUUID() }, opts) };
}

/** done | snooze {days} | reschedule {dueAt} | update {…} */
export function useReminderAction() {
  return useMutation<ReminderWithPerson, Error, ReminderActionVars>({ mutationKey: REMINDER_MUT.action });
}

export function useDeleteReminder() {
  return useMutation<unknown, Error, DeleteReminderVars>({ mutationKey: REMINDER_MUT.delete });
}
