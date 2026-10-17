import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type EmptyStateProps = {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Primary call to action (e.g. a GlassButton). */
  action?: ReactNode;
  /** Tighter spacing for use inside cards / popovers. */
  compact?: boolean;
  className?: string;
};

/** Centered "nothing here yet" message with an optional action. */
export function EmptyState({ icon, title, description, action, compact, className }: EmptyStateProps) {
  return (
    <div className={cn("mx-auto flex max-w-sm flex-col items-center text-center", compact ? "gap-2 py-6" : "gap-3 py-14", className)}>
      {icon && (
        <div
          className={cn(
            "mb-1 grid place-items-center rounded-full bg-accent-soft text-accent-text",
            compact ? "size-11 [&_svg]:size-5" : "size-16 [&_svg]:size-7",
          )}
          aria-hidden
        >
          {icon}
        </div>
      )}
      <h3 className={cn(compact ? "text-headline" : "text-title3", "text-fg")}>{title}</h3>
      {description && <p className="text-subhead text-balance text-fg-2">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
