"use client";
import { Combobox as BaseCombobox } from "@base-ui/react/combobox";
import { Select as BaseSelect } from "@base-ui/react/select";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { matchesQuery } from "./search";
import { fieldTrigger, menuItem, popupScroll, popupSurface } from "./styles";

export type SelectOption<T extends string> = {
  value: T;
  label: string;
  icon?: ReactNode;
  description?: string;
  disabled?: boolean;
};

export type SelectProps<T extends string> = {
  value: T | null;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  /** Adds a search field to the popup (diacritic-insensitive). */
  searchable?: boolean;
  searchPlaceholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  size?: "sm" | "md";
  name?: string;
  id?: string;
  "aria-label"?: string;
  className?: string;
};

/**
 * Replacement for native <select>: glass popup, check-mark on the current value, typeahead,
 * full keyboard support. On desktop the list opens aligned over the trigger (macOS style).
 */
export function Select<T extends string>(props: SelectProps<T>) {
  return props.searchable ? <SearchableSelect {...props} /> : <PlainSelect {...props} />;
}

const triggerSize = { sm: "h-9 text-subhead px-3", md: "" } as const;

function TriggerContent({ option, placeholder }: { option?: SelectOption<string>; placeholder?: string }) {
  return (
    <>
      {option?.icon && <span className="grid shrink-0 place-items-center text-fg-2 [&_svg]:size-[18px]">{option.icon}</span>}
      <span className={cn("min-w-0 flex-1 truncate", !option && "text-fg-4")}>{option?.label ?? placeholder ?? "Select…"}</span>
      <ChevronsUpDown size={16} className="shrink-0 text-fg-3" aria-hidden />
    </>
  );
}

function OptionRow({ option }: { option: SelectOption<string> }) {
  return (
    <>
      {option.icon && <span className="grid shrink-0 place-items-center">{option.icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{option.label}</span>
        {option.description && <span className="block truncate text-footnote text-fg-3">{option.description}</span>}
      </span>
    </>
  );
}

function PlainSelect<T extends string>({ value, onChange, options, placeholder, disabled, invalid, size = "md", name, id, className, ...aria }: SelectProps<T>) {
  const items = useMemo(() => options.map((o) => ({ value: o.value, label: o.label })), [options]);
  const selected = options.find((o) => o.value === value);
  return (
    <BaseSelect.Root
      items={items}
      value={value}
      onValueChange={(v) => v !== null && onChange(v as T)}
      disabled={disabled}
      name={name}
      id={id}
    >
      <BaseSelect.Trigger
        aria-label={aria["aria-label"]}
        aria-invalid={invalid || undefined}
        className={cn(fieldTrigger, triggerSize[size], className)}
      >
        <TriggerContent option={selected} placeholder={placeholder} />
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner className="ui-positioner select-none" sideOffset={6} collisionPadding={12}>
          <BaseSelect.Popup className={cn(popupSurface, "min-w-[var(--anchor-width)] max-w-[var(--available-width)]")}>
            <BaseSelect.List className={cn(popupScroll, "outline-none")}>
              {options.map((o) => (
                <BaseSelect.Item
                  key={o.value}
                  value={o.value}
                  label={o.label}
                  disabled={o.disabled}
                  className={cn(menuItem, "pr-8", o.description && "h-auto min-h-11 py-1.5")}
                >
                  <OptionRow option={o} />
                  <BaseSelect.ItemIndicator className="absolute right-2.5 grid place-items-center text-accent-text [&_svg]:!text-accent-text">
                    <Check size={16} strokeWidth={2.6} />
                  </BaseSelect.ItemIndicator>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}

function SearchableSelect<T extends string>({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder = "Search",
  disabled,
  invalid,
  size = "md",
  name,
  id,
  className,
  ...aria
}: SelectProps<T>) {
  const selected = options.find((o) => o.value === value) ?? null;
  return (
    <BaseCombobox.Root
      items={options}
      value={selected}
      onValueChange={(o) => o && onChange((o as SelectOption<T>).value)}
      itemToStringLabel={(o: SelectOption<T>) => o.label}
      isItemEqualToValue={(a: SelectOption<T>, b: SelectOption<T>) => a.value === b.value}
      filter={(o: SelectOption<T>, q) => matchesQuery(`${o.label} ${o.description ?? ""}`, q)}
      disabled={disabled}
      name={name}
      id={id}
    >
      <BaseCombobox.Trigger
        aria-label={aria["aria-label"]}
        aria-invalid={invalid || undefined}
        className={cn(fieldTrigger, triggerSize[size], className)}
      >
        <TriggerContent option={selected ?? undefined} placeholder={placeholder} />
      </BaseCombobox.Trigger>
      <BaseCombobox.Portal>
        <BaseCombobox.Positioner className="ui-positioner" align="start" sideOffset={6} collisionPadding={12}>
          <BaseCombobox.Popup
            aria-label={aria["aria-label"] ?? placeholder}
            className={cn(popupSurface, "w-[max(var(--anchor-width),260px)] max-w-[var(--available-width)] p-0")}
          >
            <div className="relative border-b-[0.5px] border-separator p-2">
              <Search size={16} className="pointer-events-none absolute top-1/2 left-4.5 -translate-y-1/2 text-fg-3" aria-hidden />
              <BaseCombobox.Input
                placeholder={searchPlaceholder}
                enterKeyHint="search"
                autoComplete="off"
                className="h-9 w-full rounded-xs bg-fill-1 pr-3 pl-8.5 text-body text-fg outline-none placeholder:text-fg-4 sm:text-subhead"
              />
            </div>
            <BaseCombobox.Empty className="px-4 py-6 text-center text-subhead text-fg-3 empty:hidden">No matches</BaseCombobox.Empty>
            <BaseCombobox.List className={cn(popupScroll, "p-2 empty:p-0")}>
              {(o: SelectOption<T>) => (
                <BaseCombobox.Item key={o.value} value={o} disabled={o.disabled} className={cn(menuItem, "pr-8", o.description && "h-auto min-h-11 py-1.5")}>
                  <OptionRow option={o} />
                  <BaseCombobox.ItemIndicator className="absolute right-2.5 grid place-items-center [&_svg]:!text-accent-text">
                    <Check size={16} strokeWidth={2.6} />
                  </BaseCombobox.ItemIndicator>
                </BaseCombobox.Item>
              )}
            </BaseCombobox.List>
          </BaseCombobox.Popup>
        </BaseCombobox.Positioner>
      </BaseCombobox.Portal>
    </BaseCombobox.Root>
  );
}
