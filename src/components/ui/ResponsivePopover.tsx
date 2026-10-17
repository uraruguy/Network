"use client";
import { useState, type ReactElement, type ReactNode } from "react";
import { useIsPhone } from "@/lib/media";
import { Popover } from "./Popover";
import { Sheet } from "./Sheet";

export type ResponsivePopoverProps = {
  trigger: ReactElement;
  /** Content. A render function receives `close()` (e.g. after picking a value). */
  children: ReactNode | ((close: () => void) => ReactNode);
  /** Sheet title on phones; accessible title for the popover. */
  title: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  /** Phone sheet: right-hand header action (e.g. "Done"). Defaults to a close button. */
  done?: string;
  onDone?: () => unknown;
  /** Extra classes for the popover panel (desktop). */
  className?: string;
};

/**
 * Popover from `sm` up, bottom sheet on phones — for pickers (dates, lists, colours) that need
 * room and big touch targets on a phone but should stay anchored and light on desktop.
 */
export function ResponsivePopover({ trigger, children, title, open: openProp, onOpenChange, side, align = "start", done, onDone, className }: ResponsivePopoverProps) {
  const isPhone = useIsPhone();
  const [uncontrolled, setUncontrolled] = useState(false);
  const open = openProp ?? uncontrolled;
  const setOpen = (o: boolean) => {
    if (openProp === undefined) setUncontrolled(o);
    onOpenChange?.(o);
  };
  const close = () => setOpen(false);
  const content = typeof children === "function" ? children(close) : children;

  if (isPhone) {
    return (
      <Sheet trigger={trigger} open={open} onOpenChange={setOpen} title={title} done={done} onDone={onDone}>
        {content}
      </Sheet>
    );
  }
  return (
    <Popover trigger={trigger} open={open} onOpenChange={setOpen} title={title} side={side} align={align} modal="trap-focus" className={className}>
      {content}
    </Popover>
  );
}
