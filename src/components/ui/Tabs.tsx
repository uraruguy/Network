"use client";
import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type TabItem<T extends string> = { value: T; label: ReactNode; icon?: ReactNode; badge?: ReactNode; disabled?: boolean };

export type TabsProps<T extends string> = {
  value: T;
  onValueChange: (value: T) => void;
  items: TabItem<T>[];
  /** `underline` (page sections) or `pill` (compact filters). */
  variant?: "underline" | "pill";
  /** `<TabPanel value="…">` elements. */
  children?: ReactNode;
  className?: string;
  listClassName?: string;
};

/**
 * Accessible tabs (roving focus, arrow keys, Enter/Space to activate) with an animated
 * indicator driven by Base UI's `--active-tab-*` variables. For 2–4 mutually exclusive views
 * of the same content prefer `SegmentedControl`.
 */
export function Tabs<T extends string>({ value, onValueChange, items, variant = "underline", children, className, listClassName }: TabsProps<T>) {
  const pill = variant === "pill";
  return (
    <BaseTabs.Root value={value} onValueChange={(v) => onValueChange(v as T)} className={className}>
      <BaseTabs.List
        className={cn(
          "no-scrollbar relative flex overflow-x-auto [contain:inline-size]",
          pill ? "gap-1" : "gap-5 border-b-[0.5px] border-separator",
          listClassName,
        )}
      >
        {items.map((item) => (
          <BaseTabs.Tab
            key={item.value}
            value={item.value}
            disabled={item.disabled}
            className={cn(
              "relative z-[1] flex shrink-0 items-center gap-1.5 whitespace-nowrap outline-offset-2 transition-colors duration-150 select-none data-[disabled]:opacity-40 [&_svg]:size-4",
              pill
                ? "h-8 rounded-full px-3.5 text-footnote font-semibold text-fg-2 hover:text-fg data-[active]:text-accent-text"
                : "h-11 text-subhead font-medium text-fg-3 hover:text-fg data-[active]:text-fg",
            )}
          >
            {item.icon}
            {item.label}
            {item.badge !== undefined && (
              <span className="min-w-5 rounded-full bg-fill-2 px-1.5 text-center text-caption2 leading-5 font-semibold text-fg-2 tabular-nums">{item.badge}</span>
            )}
          </BaseTabs.Tab>
        ))}
        <BaseTabs.Indicator
          className={cn(
            "absolute left-0 transition-[translate,width] duration-[var(--spring-snappy-dur)] ease-[var(--spring-snappy)] translate-x-[var(--active-tab-left)] w-[var(--active-tab-width)]",
            pill ? "top-1/2 h-8 -translate-y-1/2 rounded-full bg-accent-soft" : "bottom-0 h-0.5 rounded-full bg-accent",
          )}
        />
      </BaseTabs.List>
      {children}
    </BaseTabs.Root>
  );
}

export function TabPanel<T extends string>({ value, children, className, keepMounted }: { value: T; children: ReactNode; className?: string; keepMounted?: boolean }) {
  return (
    <BaseTabs.Panel value={value} keepMounted={keepMounted} className={cn("pt-4 outline-none", className)}>
      {children}
    </BaseTabs.Panel>
  );
}
