import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type InsetGroupProps = {
  /** Section header above the card. */
  header?: ReactNode;
  /** Explanatory text below the card. */
  footer?: ReactNode;
  /** Right-aligned header action (e.g. "Edit"). */
  headerAction?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * iOS "inset grouped" section: a rounded surface holding `ListRow`s separated by hairlines
 * that start at the label (not under the icon).
 */
export function InsetGroup({ header, footer, headerAction, children, className }: InsetGroupProps) {
  return (
    <section className={cn("space-y-1.5", className)}>
      {(header || headerAction) && (
        <div className="flex items-end justify-between gap-3 px-4">
          {header && <h3 className="text-footnote font-medium tracking-[0.02em] text-fg-3 uppercase">{header}</h3>}
          {headerAction && <div className="text-footnote">{headerAction}</div>}
        </div>
      )}
      <div className="surface overflow-hidden rounded-lg">{children}</div>
      {footer && <p className="px-4 text-footnote text-fg-3">{footer}</p>}
    </section>
  );
}
