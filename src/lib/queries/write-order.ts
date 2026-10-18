/**
 * Offline write ordering across entities.
 *
 * Writes are serialized per mutation scope, and scopes run concurrently when paused writes resume
 * (reconnect, reload). A write normally runs in its own entity's scope (`note:<id>`,
 * `person:<id>`, `reminder:<id>`, `activity:<id>`). When something it references hasn't reached
 * the server yet — a person created offline, a brand-new activity, a note whose first save is
 * queued — it joins the scope that parent's write is queued in, so it can't overtake it (the
 * server would answer 404 or drop the reference). Once an entity's writes sit in a joined scope,
 * its later writes follow them there, keeping per-entity order.
 *
 * Pure decision (`pickScope`) + thin cache readers; unit-tested in write-order.test.ts.
 */
import type { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";

/** Mutation key root → entity kind. Writes under other roots (tags, inbox…) aren't tracked. */
const ENTITY_KIND: Record<string, string> = { people: "person", notes: "note", reminders: "reminder", activities: "activity" };

/** The entity a write is about — `"<kind>:<id>"`, which is also that entity's own scope id — or null. */
export function writeEntity(mutationKey: readonly unknown[] | undefined, variables: unknown): string | null {
  const kind = ENTITY_KIND[String(mutationKey?.[0])];
  if (!kind) return null;
  const id = typeof variables === "string" ? variables : (variables as { id?: unknown } | null | undefined)?.id;
  return typeof id === "string" && id ? `${kind}:${id}` : null;
}

export type QueuedWrite = { entity: string | null; scope: string | undefined };

/**
 * The scope for a new write to `own` that references `deps` (parents first), given the writes
 * still pending (queued, paused or in flight) in creation order: the scope of `own`'s latest
 * pending write, else that of the first dep with one, else `own` itself.
 */
export function pickScope(queued: readonly QueuedWrite[], own: string, deps: readonly (string | null | undefined)[] = []): string {
  const scopeOf = (entity: string) => {
    for (let i = queued.length - 1; i >= 0; i--) {
      const w = queued[i]!;
      if (w.entity === entity && w.scope) return w.scope;
    }
    return null;
  };
  const mine = scopeOf(own);
  if (mine) return mine;
  for (const d of deps) {
    const s = d ? scopeOf(d) : null;
    if (s) return s;
  }
  return own;
}

/** Pending writes in creation order (the mutation cache keeps insertion order, also across a restore). */
export function queuedWrites(qc: QueryClient): QueuedWrite[] {
  return qc
    .getMutationCache()
    .getAll()
    .filter((m) => m.state.status === "pending")
    .map((m) => ({ entity: writeEntity(m.options.mutationKey, m.state.variables), scope: m.options.scope?.id }));
}

/** `pickScope` over the live mutation cache. */
export const scopeFor = (qc: QueryClient, own: string, deps: readonly (string | null | undefined)[] = []) => pickScope(queuedWrites(qc), own, deps);

/** True while a write to `entity` hasn't settled (e.g. a person created offline whose create is queued). */
export const hasQueuedWrite = (qc: QueryClient, entity: string) => queuedWrites(qc).some((w) => w.entity === entity);

/** A 404 for a write whose parent is still queued: retried until the parent lands, never dropped. */
export class ParentPendingError extends Error {
  constructor(public parent: string) {
    super("Waiting for an earlier change to sync");
    this.name = "ParentPendingError";
  }
}

/**
 * Turns "404 unknown person" into a retryable error while that person's own writes are still
 * queued — a safety net for writes queued in another scope (e.g. by an older app version).
 */
export function waitForParent(qc: QueryClient, error: unknown, parent: string | null): unknown {
  return error instanceof ApiError && error.status === 404 && parent && hasQueuedWrite(qc, parent) ? new ParentPendingError(parent) : error;
}

export const personEntity = (id: string | null | undefined) => (id ? `person:${id}` : null);
export const activityEntity = (id: string) => `activity:${id}`;
export const noteEntity = (id: string | null | undefined) => (id ? `note:${id}` : null);
export const reminderEntity = (id: string) => `reminder:${id}`;
