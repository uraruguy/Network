/**
 * Shared class recipes for the primitives, so menus, selects and comboboxes look identical.
 * Radii are concentric: popup rounded-md (16) − p-2 (8) → items rounded-xs (8).
 */
export const popupSurface = "ui-popover glass-thick specular rounded-md p-2 text-fg";

/** Scroll container inside a popup, capped to the space Base UI measured. */
export const popupScroll = "max-h-[min(var(--available-height,400px),400px)] overflow-y-auto overscroll-contain";

export const menuItem =
  "group/item relative flex h-9 cursor-default select-none items-center gap-2.5 rounded-xs px-2.5 text-subhead text-fg outline-none pointer-coarse:h-11 pointer-coarse:text-body data-[highlighted]:bg-fill-2 data-[disabled]:opacity-40 data-[disabled]:pointer-events-none [&_svg]:size-[17px] [&_svg]:shrink-0 [&_svg]:text-fg-2";

export const menuItemDestructive = "text-danger [&_svg]:text-danger";

export const menuSeparator = "mx-2.5 my-1 h-[0.5px] bg-separator";

export const menuGroupLabel = "px-2.5 pt-1.5 pb-1 text-caption font-semibold text-fg-3";

export const shortcutClass = "ml-auto pl-4 text-footnote text-fg-4 tabular-nums";

/** Trigger look shared by Select, DateField and Combobox inputs. */
export const fieldTrigger =
  "flex h-11 w-full min-w-0 items-center gap-2 rounded-sm border-[0.5px] border-hairline bg-surface-2 px-3.5 text-left text-body text-fg shadow-e1 outline-none transition-[box-shadow,border-color] duration-150 focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_var(--focus-ring)] data-[popup-open]:border-accent data-[disabled]:opacity-50 aria-invalid:border-danger data-[invalid]:border-danger";
