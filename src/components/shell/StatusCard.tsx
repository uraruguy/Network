import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Centered glass card for whole-screen states: errors, not found, offline.
 * Server-safe (no hooks), so not-found and offline pages can use it directly.
 */
export function StatusCard({
  icon,
  title,
  children,
  actions,
  tone = "accent",
  className,
}: {
  icon: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  /** Tint of the icon disc; `plain` renders the icon as-is (e.g. the app logo). */
  tone?: "accent" | "danger" | "neutral" | "plain";
  className?: string;
}) {
  return (
    <div className={cn("glass-thick specular elevation-e3 w-full max-w-sm rounded-xl px-6 pt-7 pb-6 text-center", className)}>
      <div
        aria-hidden
        className={cn(
          "mx-auto mb-4 grid place-items-center",
          tone !== "plain" && "size-14 rounded-full [&_svg]:size-7",
          tone === "danger" && "bg-danger-soft text-danger",
          tone === "neutral" && "bg-fill-2 text-fg-2",
          tone === "accent" && "bg-accent-soft text-accent-text",
        )}
      >
        {icon}
      </div>
      <h1 className="text-title3 text-balance text-fg">{title}</h1>
      {children && <div className="mt-1.5 text-subhead text-balance text-fg-2">{children}</div>}
      {actions && <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">{actions}</div>}
    </div>
  );
}

/** Full-height centering frame for a StatusCard inside the shell's content column. */
export function StatusScreen({ children }: { children: ReactNode }) {
  return <div className="grid min-h-[calc(100dvh-var(--page-pt)-var(--page-pb))] place-items-center py-8">{children}</div>;
}
