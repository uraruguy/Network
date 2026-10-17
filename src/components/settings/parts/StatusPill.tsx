import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PillTone = "ok" | "error" | "warn" | "neutral" | "busy";

const TONE: Record<PillTone, { pill: string; dot: string }> = {
  ok: { pill: "bg-success-soft text-success", dot: "bg-success" },
  error: { pill: "bg-danger-soft text-danger", dot: "bg-danger" },
  warn: { pill: "bg-warning-soft text-warning", dot: "bg-warning" },
  neutral: { pill: "bg-fill-2 text-fg-3", dot: "bg-fg-4" },
  busy: { pill: "bg-accent-soft text-accent-text", dot: "bg-accent animate-pulse" },
};

/** Small status capsule: dot + label ("Connected · 412 ms", "Not tested", "Error"). */
export function StatusPill({ tone, children, className }: { tone: PillTone; children: ReactNode; className?: string }) {
  const t = TONE[tone];
  return (
    <span className={cn("inline-flex h-6 max-w-full items-center gap-1.5 rounded-full px-2.5 text-caption font-semibold whitespace-nowrap", t.pill, className)}>
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", t.dot)} />
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Tone for a connection status from the API. */
export function connectionTone(status: "verified" | "error" | "untested" | "off"): PillTone {
  return status === "verified" ? "ok" : status === "error" ? "error" : status === "untested" ? "warn" : "neutral";
}
