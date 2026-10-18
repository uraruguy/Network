"use client";
import { Menu as BaseMenu } from "@base-ui/react/menu";
import type { ReactElement, ReactNode } from "react";
import { useMediaQuery } from "@/lib/media";
import { cn } from "@/lib/utils";
import { ActionSheet } from "./ActionSheet";
import { menuGroupLabel, menuItem, menuItemDestructive, menuSeparator, popupSurface, shortcutClass } from "./styles";

export type MenuAction = {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  destructive?: boolean;
  /** Display-only hint, e.g. "⌘⌫" (desktop only). */
  shortcut?: string;
  disabled?: boolean;
};

export type MenuItem = MenuAction | "separator";

export type MenuProps = {
  /** The button that opens the menu (e.g. an `IconButton` with a "more" icon). */
  trigger: ReactElement;
  items: MenuItem[];
  /** Optional heading (menu group label; action-sheet title on phones). */
  title?: string;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Force a presentation; default: action sheet on touch phones, popup elsewhere. */
  presentation?: "auto" | "popup" | "sheet";
  className?: string;
};

/** Touch phone → action sheet; everything else → anchored popup menu. */
const SHEET_QUERY = "(max-width: 639.98px) and (pointer: coarse)";

/**
 * Dropdown menu with keyboard navigation (arrows, typeahead, Escape) and focus return.
 * On touch phones the same items render as an iOS action sheet.
 */
export function Menu({ presentation = "auto", ...props }: MenuProps) {
  const touchPhone = useMediaQuery(SHEET_QUERY);
  const asSheet = presentation === "sheet" || (presentation === "auto" && touchPhone);
  if (asSheet) {
    return (
      <ActionSheet
        trigger={props.trigger}
        open={props.open}
        onOpenChange={props.onOpenChange}
        title={props.title}
        actions={props.items.map((i) => (i === "separator" ? i : { ...i }))}
      />
    );
  }
  return <MenuPopup {...props} />;
}

function MenuPopup({ trigger, items, title, side = "bottom", align = "end", sideOffset = 6, open, onOpenChange, className }: MenuProps) {
  return (
    <BaseMenu.Root open={open} onOpenChange={onOpenChange ? (o) => onOpenChange(o) : undefined}>
      <BaseMenu.Trigger render={trigger} />
      <BaseMenu.Portal>
        <BaseMenu.Positioner className="ui-positioner" side={side} align={align} sideOffset={sideOffset} collisionPadding={12}>
          <BaseMenu.Popup className={cn(popupSurface, "min-w-[220px] max-w-[min(320px,var(--available-width))]", className)}>
            {title && <div className={menuGroupLabel}>{title}</div>}
            <MenuItems items={items} kit={BaseMenu} />
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}

type ItemKit = {
  Item: typeof BaseMenu.Item;
  Separator: typeof BaseMenu.Separator;
};

/** Shared item renderer for Menu and ContextMenu. */
export function MenuItems({ items, kit: K }: { items: MenuItem[]; kit: ItemKit }) {
  return (
    <>
      {items.map((item, i) =>
        item === "separator" ? (
          <K.Separator key={`sep-${i}`} className={menuSeparator} />
        ) : (
          <K.Item
            key={item.label}
            label={item.label}
            disabled={item.disabled}
            onClick={() => item.onSelect()}
            className={cn(menuItem, item.destructive && menuItemDestructive)}
          >
            {item.icon}
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.shortcut && <kbd className={cn(shortcutClass, "font-sans pointer-coarse:hidden")}>{item.shortcut}</kbd>}
          </K.Item>
        ),
      )}
    </>
  );
}
