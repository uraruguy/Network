"use client";
import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type { ReactElement, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type TooltipProps = {
  /** The element being described (must accept a ref + pointer/focus handlers). */
  children: ReactElement;
  content: ReactNode;
  /** Keyboard shortcut hint, e.g. "⌘K". */
  shortcut?: string;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  /** Hover delay in ms (default 500). */
  delay?: number;
  disabled?: boolean;
  className?: string;
};

/**
 * Hover/focus label for mouse & keyboard users. Never shows on touch (Base UI disables
 * tooltips for touch input), so it must only repeat information that is available otherwise
 * (e.g. an IconButton's `label`).
 */
export function Tooltip({ children, content, shortcut, side = "bottom", align = "center", delay = 500, disabled, className }: TooltipProps) {
  return (
    <BaseTooltip.Root disabled={disabled}>
      <BaseTooltip.Trigger render={children} delay={delay} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner className="z-[var(--z-tooltip)]" side={side} align={align} sideOffset={8} collisionPadding={8}>
          <BaseTooltip.Popup
            className={cn(
              "ui-tooltip glass-thick flex items-center gap-2 rounded-xs px-2.5 py-1.5 text-footnote font-medium text-fg elevation-e2",
              className,
            )}
          >
            {content}
            {shortcut && <kbd className="font-sans text-fg-3">{shortcut}</kbd>}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}

/** Wrap a toolbar so adjacent tooltips open instantly after the first. */
export const TooltipProvider = BaseTooltip.Provider;
