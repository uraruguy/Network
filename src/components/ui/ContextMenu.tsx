"use client";
import { ContextMenu as BaseContextMenu } from "@base-ui/react/context-menu";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { MenuItems, type MenuItem } from "./Menu";
import { menuGroupLabel, popupSurface } from "./styles";

export type ContextMenuProps = {
  /** The area that responds to right-click (desktop) and long-press (touch). */
  children: ReactNode;
  items: MenuItem[];
  title?: string;
  disabled?: boolean;
  /** Class for the trigger wrapper (renders a <div>). */
  className?: string;
};

/**
 * Right-click / long-press menu. Always pair it with a visible way to reach the same actions
 * (e.g. a "more" `Menu` button) — context menus are an accelerator, not the only path.
 */
export function ContextMenu({ children, items, title, disabled, className }: ContextMenuProps) {
  return (
    <BaseContextMenu.Root disabled={disabled}>
      <BaseContextMenu.Trigger className={cn("[-webkit-touch-callout:none]", className)}>{children}</BaseContextMenu.Trigger>
      <BaseContextMenu.Portal>
        <BaseContextMenu.Positioner className="ui-positioner" collisionPadding={12}>
          <BaseContextMenu.Popup className={cn(popupSurface, "min-w-[220px] max-w-[min(320px,var(--available-width))]")}>
            {title && <div className={menuGroupLabel}>{title}</div>}
            <MenuItems items={items} kit={BaseContextMenu} />
          </BaseContextMenu.Popup>
        </BaseContextMenu.Positioner>
      </BaseContextMenu.Portal>
    </BaseContextMenu.Root>
  );
}
