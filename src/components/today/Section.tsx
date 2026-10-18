import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A Today section: title (+ count), optional trailing action and caption, then content. */
export function Section({
  id,
  title,
  count,
  caption,
  action,
  children,
  className,
}: {
  id: string;
  title: ReactNode;
  count?: number;
  caption?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={`${id}-title`} id={id} className={cn("scroll-mt-24", className)}>
      <div className="mb-2.5 px-1">
        <div className="flex items-center justify-between gap-3">
          <h2 id={`${id}-title`} className="flex items-baseline gap-2 text-title3 text-fg">
            {title}
            {!!count && <span className="text-subhead font-medium text-fg-3 tabular-nums">{count}</span>}
          </h2>
          {action && <div className="shrink-0 text-subhead">{action}</div>}
        </div>
        {caption && <p className="mt-0.5 text-footnote text-fg-3">{caption}</p>}
      </div>
      {children}
    </section>
  );
}
