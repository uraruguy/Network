"use client";
import { Popover as BasePopover } from "@base-ui/react/popover";
import type { ReactElement, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PopoverProps = {
  /** Element that toggles the popover. */
  trigger: ReactElement;
  children: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Accessible title; rendered as a small heading when `showTitle`. */
  title?: ReactNode;
  showTitle?: boolean;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  /** Also open on hover (info-tips). Touch and keyboard still work. */
  openOnHover?: boolean;
  /** Trap focus inside (forms in a popover). Default false. */
  modal?: boolean | "trap-focus";
  initialFocus?: React.RefObject<HTMLElement | null> | boolean;
  className?: string;
};

/**
 * Anchored glass popover: dismisses on outside press / Escape, returns focus to its trigger.
 * For phone-friendly pickers use `ResponsivePopover` (bottom sheet below `sm`).
 */
export function Popover({
  trigger,
  children,
  open,
  defaultOpen,
  onOpenChange,
  title,
  showTitle,
  side = "bottom",
  align = "center",
  sideOffset = 8,
  openOnHover,
  modal = false,
  initialFocus,
  className,
}: PopoverProps) {
  return (
    <BasePopover.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange ? (o) => onOpenChange(o) : undefined} modal={modal}>
      <BasePopover.Trigger render={trigger} openOnHover={openOnHover} />
      <BasePopover.Portal>
        <BasePopover.Positioner className="ui-positioner" side={side} align={align} sideOffset={sideOffset} collisionPadding={12}>
          <BasePopover.Popup
            initialFocus={initialFocus}
            className={cn(
              "ui-popover glass-thick specular max-h-[var(--available-height)] max-w-[min(360px,var(--available-width))] overflow-y-auto overscroll-contain rounded-lg p-4 text-fg",
              className,
            )}
          >
            {title && (
              <BasePopover.Title className={showTitle ? "mb-2 text-headline" : "sr-only"}>{title}</BasePopover.Title>
            )}
            {children}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}

/** Close button for use inside popover content. */
export const PopoverClose = BasePopover.Close;
