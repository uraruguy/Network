"use client";
import { onlineManager, useMutationState } from "@tanstack/react-query";
import { CloudOff, RefreshCw } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

const subscribeOnline = (cb: () => void) => onlineManager.subscribe(cb);
const getOnline = () => onlineManager.isOnline();
const getServerOnline = () => true;

/** In-flight writes normally finish in a blink; only mention them if they linger this long. */
const SLOW_SYNC_MS = 1500;

export type SyncState = {
  online: boolean;
  /** Mutations waiting for the network (offline, or not yet resumed). */
  waiting: number;
  /** Mutations currently in flight. */
  syncing: number;
  /** "Offline" / "3 changes waiting to sync" / "Syncing 1 change…" / null when all is well. */
  message: string | null;
};

const changes = (n: number) => `${n} change${n === 1 ? "" : "s"}`;

/** Connectivity (TanStack onlineManager) × pending mutations → one status line. */
export function useSyncState(): SyncState {
  const online = useSyncExternalStore(subscribeOnline, getOnline, getServerOnline);
  const paused = useMutationState({ filters: { status: "pending" }, select: (m) => m.state.isPaused });
  const waiting = paused.filter(Boolean).length;
  const syncing = paused.length - waiting;
  const slow = useLingering(syncing > 0, SLOW_SYNC_MS);

  let message: string | null = null;
  if (!online) message = waiting + syncing > 0 ? `Offline · ${changes(waiting + syncing)} waiting to sync` : "Offline";
  else if (waiting > 0) message = `${changes(waiting)} waiting to sync`;
  else if (slow) message = `Syncing ${changes(syncing)}…`;
  return { online, waiting, syncing, message };
}

/** True once `flag` has stayed true for `ms`. */
function useLingering(flag: boolean, ms: number) {
  const [lingering, setLingering] = useState(false);
  useEffect(() => {
    if (!flag) return;
    const t = setTimeout(() => setLingering(true), ms);
    return () => {
      clearTimeout(t);
      setLingering(false);
    };
  }, [flag, ms]);
  return flag && lingering;
}

/**
 * Sync/connectivity status.
 * - `inline` (sidebar footer): always visible — a dot plus "Synced" or the current message.
 * - `floating` (phones): a small glass capsule under the status bar, shown only when there is
 *   something to say (offline, unsynced changes, a slow sync).
 */
export function SyncStatus({ variant = "inline", className }: { variant?: "inline" | "floating"; className?: string }) {
  const { online, waiting, message } = useSyncState();

  if (variant === "inline") {
    return (
      <div role="status" className={cn("flex min-h-6 items-center gap-2 text-caption text-fg-3", className)}>
        <span
          aria-hidden
          className={cn(
            "size-2 shrink-0 rounded-full transition-colors duration-300",
            !online ? "bg-warm-dormant" : waiting > 0 || message ? "bg-accent" : "bg-success",
          )}
        />
        <span className="truncate">{message ?? "Synced"}</span>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      data-visible={message ? "" : undefined}
      className={cn("sync-pill pointer-events-none fixed inset-x-0 z-[var(--z-toast)] flex justify-center", className)}
    >
      <span className="glass-thick specular elevation-e3 inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-footnote font-medium text-fg-2">
        {!online ? <CloudOff size={14} aria-hidden /> : <RefreshCw size={13} aria-hidden className="animate-spin [animation-duration:2s]" />}
        {message ?? ""}
      </span>
    </div>
  );
}
