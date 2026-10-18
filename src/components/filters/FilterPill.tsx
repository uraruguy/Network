"use client";
import { ChevronDown, X } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type FilterPillProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  label: ReactNode;
  icon?: ReactNode;
  /** Filled accent look ("Activities · 2"). */
  active?: boolean;
  /** Show the disclosure chevron (hidden while active — the clear button takes its place). */
  chevron?: boolean;
  /** Shows a trailing ×; pressing it calls this (instead of opening the picker). */
  onClear?: () => void;
  clearLabel?: string;
};

/**
 * Filter pill: 32px tall (44px hit area), neutral fill when idle, accent when it holds a selection.
 * The main button is the popover trigger (ref + props are forwarded to it); the optional clear
 * button sits beside it inside the same capsule.
 */
export const FilterPill = forwardRef<HTMLButtonElement, FilterPillProps>(function FilterPill(
  { label, icon, active, chevron = true, onClear, clearLabel = "Clear filter", className, type = "button", ...rest },
  ref,
) {
  const button = (
    <button
      ref={ref}
      type={type}
      className={cn(
        "hit-44 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-footnote font-medium whitespace-nowrap outline-offset-2 transition-[background-color,color] duration-150 [&_svg]:size-3.5 [&_svg]:shrink-0",
        active ? "bg-accent-fill text-accent-fg" : "bg-fill-2 text-fg-2 hover:bg-fill-3 hover:text-fg data-[popup-open]:bg-fill-3 data-[popup-open]:text-fg",
        // A split capsule dims on press instead of scaling (half a pill shrinking looks broken).
        active && onClear ? "rounded-r-none pr-1.5 active:opacity-75" : "pressable",
        className,
      )}
      {...rest}
    >
      {icon}
      <span className="max-w-[40vw] truncate sm:max-w-[220px]">{label}</span>
      {chevron && !(active && onClear) && <ChevronDown strokeWidth={2.6} className="-mr-0.5 opacity-70" aria-hidden />}
    </button>
  );
  // Same tree whether or not the clear button shows: the trigger must not remount while its popover is open.
  return (
    <span className="inline-flex shrink-0 items-center">
      {button}
      {active && onClear && (
        <button
          type="button"
          aria-label={clearLabel}
          onClick={onClear}
          // Vertical-only hit extension so it never steals presses from the label beside it.
          className="relative inline-grid h-8 w-8 shrink-0 place-items-center rounded-r-full bg-accent-fill pr-1 text-accent-fg outline-offset-2 before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2 hover:brightness-110 active:opacity-75 [&_svg]:size-3.5"
        >
          <X strokeWidth={2.8} aria-hidden />
        </button>
      )}
    </span>
  );
});
