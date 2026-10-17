"use client";
import { Drawer } from "@base-ui/react/drawer";
import { Fragment, useState, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ActionSheetAction = {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

export type ActionSheetProps = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Uncontrolled trigger element. */
  trigger?: ReactElement;
  title?: ReactNode;
  message?: ReactNode;
  /** `"separator"` inserts a gap between groups of actions. */
  actions: (ActionSheetAction | "separator")[];
  /** Default "Cancel". */
  cancelLabel?: string;
};

const row =
  "flex min-h-14 w-full items-center gap-3 px-4 text-title3 font-normal text-accent-text outline-none transition-colors duration-150 active:bg-fill-2 focus-visible:bg-fill-2 disabled:opacity-40 disabled:pointer-events-none [@media(hover:hover)]:hover:bg-fill-1";

/**
 * iOS action sheet: grouped actions slide up from the bottom, Cancel sits apart below.
 * Swipe down, tap outside or press Escape to cancel. `Menu` renders as this on touch phones.
 */
export function ActionSheet({ open: openProp, defaultOpen = false, onOpenChange, trigger, title, message, actions, cancelLabel = "Cancel" }: ActionSheetProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen);
  const open = openProp ?? uncontrolled;
  const setOpen = (o: boolean) => {
    if (openProp === undefined) setUncontrolled(o);
    onOpenChange?.(o);
  };
  const hasIcons = actions.some((a) => a !== "separator" && a.icon);

  // Split into visual groups at separators.
  const groups: ActionSheetAction[][] = [[]];
  for (const a of actions) {
    if (a === "separator") groups.push([]);
    else groups[groups.length - 1]!.push(a);
  }

  return (
    <Drawer.Root open={open} onOpenChange={setOpen}>
      {trigger && <Drawer.Trigger render={trigger} />}
      <Drawer.Portal>
        <Drawer.Backdrop className="ui-backdrop" />
        <Drawer.Viewport className="ui-sheet-viewport">
          <Drawer.Popup className="ui-action-sheet">
            {groups
              .filter((g, i) => g.length > 0 || (i === 0 && (title || message)))
              .map((group, gi) => (
                <div key={gi} className="glass-thick overflow-hidden rounded-md elevation-e3">
                  {gi === 0 && (title || message) && (
                    <div className="border-b-[0.5px] border-separator px-4 pt-3.5 pb-3 text-center">
                      {title && <Drawer.Title className="text-footnote font-semibold text-fg-3">{title}</Drawer.Title>}
                      {message && <Drawer.Description className="mt-0.5 text-footnote text-fg-3">{message}</Drawer.Description>}
                    </div>
                  )}
                  {group.map((a, i) => (
                    <Fragment key={a.label}>
                      {i > 0 && <div className="mx-4 h-[0.5px] bg-separator" />}
                      <button
                        type="button"
                        disabled={a.disabled}
                        className={cn(row, hasIcons ? "justify-between text-left" : "justify-center", a.destructive && "text-danger")}
                        onClick={() => {
                          setOpen(false);
                          a.onSelect();
                        }}
                      >
                        <span className="truncate">{a.label}</span>
                        {hasIcons && <span className="grid size-6 shrink-0 place-items-center [&_svg]:size-[22px]">{a.icon}</span>}
                      </button>
                    </Fragment>
                  ))}
                </div>
              ))}
            <div className="glass-thick overflow-hidden rounded-md elevation-e3">
              <Drawer.Close className={cn(row, "justify-center font-semibold")}>{cancelLabel}</Drawer.Close>
            </div>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
