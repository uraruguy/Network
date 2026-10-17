"use client";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { useState, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { iconButtonVariants } from "./IconButton";

export type DialogProps = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onOpenChangeComplete?: (open: boolean) => void;
  /** Uncontrolled trigger element. */
  trigger?: ReactElement;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Action row (buttons). Stacks full-width on phones, right-aligned from `sm`. */
  actions?: ReactNode;
  /** Max width in px (default 420). */
  width?: number;
  /** Show a close (×) button in the corner. Default true. */
  closeButton?: boolean;
  /** `false`: outside presses don't close (Escape still does). */
  dismissible?: boolean;
  initialFocus?: React.RefObject<HTMLElement | null> | boolean;
  className?: string;
};

/**
 * Centered modal dialog on every screen size — for short, focused tasks (rename, pick, small
 * forms). Use `Sheet` for longer content and `confirm()` for yes/no questions.
 */
export function Dialog({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  onOpenChangeComplete,
  trigger,
  title,
  description,
  children,
  actions,
  width = 420,
  closeButton = true,
  dismissible = true,
  initialFocus,
  className,
}: DialogProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen);
  const open = openProp ?? uncontrolled;
  return (
    <BaseDialog.Root
      open={open}
      disablePointerDismissal={!dismissible}
      onOpenChange={(next) => {
        if (openProp === undefined) setUncontrolled(next);
        onOpenChange?.(next);
      }}
      onOpenChangeComplete={onOpenChangeComplete}
    >
      {trigger && <BaseDialog.Trigger render={trigger} />}
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="ui-backdrop" />
        <BaseDialog.Viewport className="ui-dialog-viewport">
          <BaseDialog.Popup
            initialFocus={initialFocus}
            style={{ "--dialog-width": `${width}px` } as CSSProperties}
            className={cn("ui-dialog glass-thick specular overflow-hidden p-5 text-fg elevation-e4", className)}
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <BaseDialog.Title className="text-title3 text-fg">{title}</BaseDialog.Title>
                {description && <BaseDialog.Description className="mt-1 text-subhead text-fg-2">{description}</BaseDialog.Description>}
              </div>
              {closeButton ? (
                <BaseDialog.Close aria-label="Close" className={cn(iconButtonVariants({ variant: "fill", size: "sm" }), "-mt-0.5 -mr-1")}>
                  <X strokeWidth={2.4} />
                </BaseDialog.Close>
              ) : (
                <BaseDialog.Close className="sr-only">Close</BaseDialog.Close>
              )}
            </div>
            {children && <div className="mt-4 min-h-0 overflow-y-auto overscroll-contain">{children}</div>}
            {actions && <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{actions}</div>}
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

/** Close button for use inside `actions` (closes without extra wiring). */
export const DialogClose = BaseDialog.Close;
