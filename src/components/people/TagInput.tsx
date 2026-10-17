"use client";
import { Combobox as BaseCombobox } from "@base-ui/react/combobox";
import { Check, Plus, X } from "lucide-react";
import { useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { filterByQuery, normalizeForSearch } from "@/components/ui/search";
import { menuItem, popupScroll, popupSurface } from "@/components/ui/styles";
import { paletteVar } from "@/lib/constants/palette";
import { cn } from "@/lib/utils";

export type TagSuggestion = { name: string; count?: number; color?: string | null };

type Item = TagSuggestion & { create?: boolean };

type Props = {
  /** Selected tag names. */
  value: string[];
  onChange: (names: string[]) => void;
  /** Existing tags offered while typing (with usage counts). */
  suggestions?: readonly TagSuggestion[];
  placeholder?: string;
  /** Max characters per tag (the API allows 60). */
  maxLength?: number;
  /** Noun for the create row / labels: "tag", "language" … */
  noun?: string;
  id?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  className?: string;
};

const clean = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);
const same = (a: string, b: string) => normalizeForSearch(a) === normalizeForSearch(b);

/**
 * Token field: chips + text. Suggestions come from existing tags (with counts); "Create “x”" adds
 * a new one. Enter or comma adds what's typed (pasting "a, b, c" adds three), Backspace on an
 * empty field removes the last chip, leaving the field adds pending text.
 */
export function TagInput({ value, onChange, suggestions = [], placeholder = "Add tags", maxLength = 60, noun = "tag", id, className, ...aria }: Props) {
  const [query, setQuery] = useState("");
  const highlighted = useRef<Item | undefined>(undefined);
  const open = useRef(false);
  const popupRef = useRef<HTMLDivElement>(null);

  const byName = useMemo(() => new Map(suggestions.map((s) => [normalizeForSearch(s.name), s])), [suggestions]);
  const selected: Item[] = useMemo(() => value.map((name) => byName.get(normalizeForSearch(name)) ?? { name }), [value, byName]);

  const items: Item[] = useMemo(() => {
    const text = clean(query, maxLength);
    const pool = suggestions.filter((s) => !value.some((v) => same(v, s.name)));
    const matches = filterByQuery(pool, text, (s) => s.name).slice(0, 40);
    const exists = suggestions.some((s) => same(s.name, text)) || value.some((v) => same(v, text));
    return text && !exists ? [...matches, { name: text, create: true }] : matches;
  }, [query, suggestions, value, maxLength]);

  /** Adds names (deduped case/diacritic-insensitively, existing spellings win). */
  const add = (names: string[]) => {
    const next = [...value];
    for (const raw of names) {
      const name = clean(raw, maxLength);
      if (!name || next.some((v) => same(v, name))) continue;
      next.push(byName.get(normalizeForSearch(name))?.name ?? name);
    }
    if (next.length !== value.length) onChange(next);
  };

  const onInput = (text: string) => {
    if (!text.includes(",")) return setQuery(text);
    const parts = text.split(",");
    const rest = parts.pop() ?? "";
    add(parts);
    setQuery(rest.trimStart());
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing && query.trim() && !highlighted.current) {
      e.preventDefault();
      add([query]);
      setQuery("");
    }
    // Base UI clears every chip on Escape when the popup is closed; let Escape close the sheet instead.
    if (e.key === "Escape" && !open.current) (e as unknown as { preventBaseUIHandler?: () => void }).preventBaseUIHandler?.();
  };

  const onBlur = (e: FocusEvent<HTMLInputElement>) => {
    const to = e.relatedTarget as Node | null;
    if (to && popupRef.current?.contains(to)) return;
    if (query.trim()) {
      add([query]);
      setQuery("");
    }
  };

  return (
    <BaseCombobox.Root<Item, true>
      multiple
      items={items}
      value={selected}
      onValueChange={(next) => {
        onChange(cleanList(next.map((i) => i.name), maxLength));
        setQuery("");
      }}
      inputValue={query}
      onInputValueChange={(v, d) => d.reason !== "item-press" && onInput(v)}
      onItemHighlighted={(item) => {
        highlighted.current = item;
      }}
      onOpenChange={(o) => {
        open.current = o;
      }}
      itemToStringLabel={(i) => i.name}
      isItemEqualToValue={(a, b) => same(a.name, b.name)}
      filter={null}
      autoHighlight
    >
      <BaseCombobox.InputGroup
        aria-invalid={aria["aria-invalid"] || undefined}
        className={cn(
          "flex min-h-11 w-full flex-wrap items-center gap-1.5 rounded-sm border-[0.5px] border-hairline bg-surface-2 px-2 py-1.5 shadow-e1 transition-[box-shadow,border-color] duration-150 focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--focus-ring)] aria-invalid:border-danger",
          className,
        )}
      >
        <BaseCombobox.Chips className="contents">
          {selected.map((item) => {
            const tint = item.color ? paletteVar(item.color) : null;
            return (
              <BaseCombobox.Chip
                key={normalizeForSearch(item.name)}
                className={cn(
                  "inline-flex h-7 max-w-full items-center gap-0.5 rounded-full pr-0.5 pl-2.5 text-footnote font-medium outline-none data-[highlighted]:ring-2 data-[highlighted]:ring-[var(--focus-ring)]",
                  !tint && "bg-accent-soft text-accent-text",
                )}
                style={tint ? { background: `color-mix(in oklab, ${tint} 16%, transparent)`, color: `color-mix(in oklab, ${tint} 62%, var(--fg))` } : undefined}
              >
                <span className="truncate">{item.name}</span>
                <BaseCombobox.ChipRemove aria-label={`Remove ${item.name}`} className="hit-44 relative grid size-6 place-items-center rounded-full hover:bg-fill-2">
                  <X size={12} strokeWidth={2.6} />
                </BaseCombobox.ChipRemove>
              </BaseCombobox.Chip>
            );
          })}
          {/* Inside Chips: Base UI's Backspace-removes-last-chip and arrow-key chip navigation need it. */}
          <BaseCombobox.Input
            id={id}
            aria-label={aria["aria-label"] ?? placeholder}
            placeholder={value.length ? undefined : placeholder}
            autoComplete="off"
            autoCapitalize="none"
            enterKeyHint="enter"
            maxLength={maxLength + 1}
            onKeyDown={onKeyDown}
            onBlur={onBlur}
            className="h-8 min-w-24 flex-1 bg-transparent px-1 text-body text-fg outline-none placeholder:text-fg-4"
          />
        </BaseCombobox.Chips>
      </BaseCombobox.InputGroup>
      <BaseCombobox.Portal>
        <BaseCombobox.Positioner className="ui-positioner" align="start" sideOffset={6} collisionPadding={12}>
          <BaseCombobox.Popup ref={popupRef} className={cn(popupSurface, "w-[var(--anchor-width)] max-w-[var(--available-width)]")}>
            <BaseCombobox.Empty className="px-3 py-4 text-center text-subhead text-fg-3 empty:hidden">
              {suggestions.length ? `No matching ${noun}s` : `Type to add a ${noun}`}
            </BaseCombobox.Empty>
            <BaseCombobox.List className={popupScroll}>
              {(item: Item) =>
                item.create ? (
                  <BaseCombobox.Item key={`create:${item.name}`} value={item} className={cn(menuItem, "text-accent-text [&_svg]:text-accent-text")}>
                    <Plus />
                    <span className="truncate">Create “{item.name}”</span>
                  </BaseCombobox.Item>
                ) : (
                  <BaseCombobox.Item key={normalizeForSearch(item.name)} value={item} className={cn(menuItem, "pr-8")}>
                    {item.color && <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: paletteVar(item.color) }} />}
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                    {item.count !== undefined && <span className="text-footnote text-fg-3 tabular-nums">{item.count}</span>}
                    <BaseCombobox.ItemIndicator className="absolute right-2.5 grid place-items-center [&_svg]:!text-accent-text">
                      <Check size={16} strokeWidth={2.6} />
                    </BaseCombobox.ItemIndicator>
                  </BaseCombobox.Item>
                )
              }
            </BaseCombobox.List>
          </BaseCombobox.Popup>
        </BaseCombobox.Positioner>
      </BaseCombobox.Portal>
    </BaseCombobox.Root>
  );
}

function cleanList(names: string[], max: number): string[] {
  const out: string[] = [];
  for (const raw of names) {
    const name = clean(raw, max);
    if (name && !out.some((o) => same(o, name))) out.push(name);
  }
  return out;
}
