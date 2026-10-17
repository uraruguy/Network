"use client";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ListRowProps = {
  label: ReactNode;
  /** Second line under the label. */
  description?: ReactNode;
  /** Leading icon. With `iconColor` it sits in a tinted tile (Settings-style). */
  icon?: ReactNode;
  iconColor?: string;
  /** Leading media that isn't an icon (e.g. an Avatar). */
  leading?: ReactNode;
  /** Trailing secondary text. */
  value?: ReactNode;
  /** Trailing control (Switch, badge…) — replaces `value`. */
  accessory?: ReactNode;
  /** Show a disclosure chevron (automatic for `href`). */
  chevron?: boolean;
  href?: string;
  onClick?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  className?: string;
};

/**
 * One row of an `InsetGroup`: 44px minimum, pressed highlight, inset hairline separator.
 * Renders a Next `<Link>` with `href`, a `<button>` with `onClick`, otherwise a `<div>`.
 */
export function ListRow({ label, description, icon, iconColor, leading, value, accessory, chevron, href, onClick, destructive, disabled, className }: ListRowProps) {
  const interactive = !!href || !!onClick;
  const hasLead = !!icon || !!leading;
  const showChevron = chevron ?? !!href;

  const body = (
    <>
      {leading}
      {icon &&
        (iconColor ? (
          <span
            className="grid size-[30px] shrink-0 place-items-center rounded-xs text-white [&_svg]:size-[18px]"
            style={{ background: iconColor }}
            aria-hidden
          >
            {icon}
          </span>
        ) : (
          <span className={cn("grid size-[30px] shrink-0 place-items-center [&_svg]:size-5", destructive ? "text-danger" : "text-accent-text")} aria-hidden>
            {icon}
          </span>
        ))}
      <span className="flex min-w-0 flex-1 items-center gap-3 self-stretch py-2.5">
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-body", destructive ? "text-danger" : "text-fg")}>{label}</span>
          {description && <span className="mt-0.5 block truncate text-footnote text-fg-3">{description}</span>}
        </span>
        {accessory ?? (value !== undefined && value !== null && <span className="max-w-[50%] shrink-0 truncate text-body text-fg-3">{value}</span>)}
        {showChevron && <ChevronRight size={18} strokeWidth={2.4} className="-mr-1 shrink-0 text-fg-4" aria-hidden />}
      </span>
    </>
  );

  const classes = cn(
    "group/row relative flex min-h-11 w-full items-center gap-3 pr-4 pl-4 text-left outline-none",
    // Inset separator: starts at the label, hidden on the last row.
    "after:absolute after:right-0 after:bottom-0 after:left-[var(--sep-inset)] after:h-[0.5px] after:bg-separator last:after:hidden",
    interactive && "cursor-pointer transition-colors duration-150 active:bg-fill-2 focus-visible:bg-fill-1 [@media(hover:hover)]:hover:bg-fill-1",
    disabled && "pointer-events-none opacity-45",
    className,
  );
  const style = { "--sep-inset": hasLead ? "58px" : "16px" } as CSSProperties;

  if (href)
    return (
      <Link href={href} className={classes} style={style} aria-disabled={disabled || undefined}>
        {body}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={classes} style={style}>
        {body}
      </button>
    );
  return (
    <div className={classes} style={style}>
      {body}
    </div>
  );
}
