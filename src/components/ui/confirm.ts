/**
 * Imperative confirmation — a drop-in, awaitable replacement for `window.confirm()`.
 *
 *   if (!(await confirm({ title: "Delete Anna?", message: "Notes stay in the archive.",
 *                         confirmLabel: "Delete", destructive: true }))) return;
 *
 * Requests queue in a tiny external store rendered by <ConfirmHost/> (mounted in Providers):
 * an iOS action sheet on phones, a centered alert on larger screens.
 */
import { useSyncExternalStore } from "react";

export type ConfirmOptions = {
  title: string;
  message?: string;
  /** Default "OK" (or "Delete" when `destructive`). */
  confirmLabel?: string;
  /** Default "Cancel". */
  cancelLabel?: string;
  /** Red confirm action; Cancel becomes the default (focused) button. */
  destructive?: boolean;
};

export type ConfirmRequest = ConfirmOptions & { id: number; resolve: (ok: boolean) => void };

type Listener = () => void;

export function createConfirmStore() {
  let queue: readonly ConfirmRequest[] = [];
  let nextId = 1;
  const listeners = new Set<Listener>();
  const emit = () => listeners.forEach((l) => l());

  return {
    /** Enqueue a request; resolves `true` on confirm, `false` on cancel/dismiss. */
    confirm(options: ConfirmOptions | string): Promise<boolean> {
      const opts = typeof options === "string" ? { title: options } : options;
      return new Promise<boolean>((resolve) => {
        queue = [...queue, { ...opts, id: nextId++, resolve }];
        emit();
      });
    },
    /** Answer a request (removes it from the queue). No-op for unknown ids. */
    resolve(id: number, ok: boolean) {
      const req = queue.find((r) => r.id === id);
      if (!req) return;
      queue = queue.filter((r) => r.id !== id);
      emit();
      req.resolve(ok);
    },
    /** Cancel everything (e.g. on navigation). */
    clear() {
      const pending = queue;
      queue = [];
      emit();
      pending.forEach((r) => r.resolve(false));
    },
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => queue,
  };
}

export const confirmStore = createConfirmStore();

/** Ask the user a yes/no question. Must have <ConfirmHost/> mounted (Providers does). */
export const confirm = (options: ConfirmOptions | string) => confirmStore.confirm(options);

const EMPTY: readonly ConfirmRequest[] = [];
export function useConfirmQueue(): readonly ConfirmRequest[] {
  return useSyncExternalStore(confirmStore.subscribe, confirmStore.getSnapshot, () => EMPTY);
}
