"use client";
import { Combobox as BaseCombobox } from "@base-ui/react/combobox";
import { Check, Plus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "./Spinner";
import { normalizeForSearch } from "./search";
import { menuItem, popupScroll, popupSurface } from "./styles";

// Diacritic-insensitive matching helpers — use them inside your `search` function.
export { filterByQuery, matchesQuery, matchRank, normalizeForSearch } from "./search";

type CreateItem = { __create: string };
const isCreate = (x: unknown): x is CreateItem => typeof x === "object" && x !== null && "__create" in x;

type Common<T> = {
  /** Returns matching items for a query (sync or async). Called with "" when the popup opens. */
  search: (query: string) => readonly T[] | Promise<readonly T[]>;
  renderItem: (item: T, state: { selected: boolean }) => ReactNode;
  getKey: (item: T) => string;
  /** Text for the input / chips / typeahead. Default `String(item)`. */
  getLabel?: (item: T) => string;
  /** Offer "Create “query”" when nothing matches exactly. */
  creatable?: boolean;
  /** Called with the typed text; return the new item to select it. */
  onCreate?: (query: string) => T | void | Promise<T | void>;
  placeholder?: string;
  emptyText?: string;
  /** Debounce async searches (ms). Default 0 (immediate). */
  debounceMs?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  invalid?: boolean;
  "aria-label"?: string;
  id?: string;
  className?: string;
};

export type ComboboxProps<T> =
  | (Common<T> & { multiple?: false; value: T | null; onChange: (value: T | null) => void })
  | (Common<T> & { multiple: true; value: T[]; onChange: (value: T[]) => void });

/**
 * Searchable picker with async-safe results (stale responses are dropped), optional multi-select
 * chips and "create new" — for people, cities, tags. Filtering is up to `search`; use the
 * exported `filterByQuery` for diacritic-insensitive local matching.
 */
export function Combobox<T>(props: ComboboxProps<T>) {
  const { search, renderItem, getKey, creatable, onCreate, placeholder, emptyText = "No results", debounceMs = 0, disabled, autoFocus, invalid, id, className } = props;
  const getLabel = useMemo(() => props.getLabel ?? ((x: T) => String(x)), [props.getLabel]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly T[]>([]);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(
    (q: string) => {
      const ticket = ++seq.current;
      if (timer.current) clearTimeout(timer.current);
      const exec = () => {
        let out: readonly T[] | Promise<readonly T[]>;
        try {
          out = search(q);
        } catch {
          out = [];
        }
        if (out instanceof Promise) {
          setLoading(true);
          out
            .then((r) => ticket === seq.current && setResults(r))
            .catch(() => ticket === seq.current && setResults([]))
            .finally(() => ticket === seq.current && setLoading(false));
        } else {
          setResults(out);
          setLoading(false);
        }
      };
      if (debounceMs > 0 && q) timer.current = setTimeout(exec, debounceMs);
      else exec();
    },
    [search, debounceMs],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const selectedList: T[] = props.multiple ? props.value : props.value ? [props.value] : [];
  const selectedKeys = new Set(selectedList.map(getKey));
  const trimmed = query.trim();
  const showCreate =
    creatable && trimmed.length > 0 && !results.some((r) => normalizeForSearch(getLabel(r)) === normalizeForSearch(trimmed));

  // Keep selected items resolvable while results change; append the create row last.
  const items: (T | CreateItem)[] = useMemo(() => {
    const keys = new Set(results.map(getKey));
    const extra = selectedList.filter((s) => !keys.has(getKey(s)));
    const base: (T | CreateItem)[] = [...results, ...(props.multiple ? [] : extra)];
    return showCreate ? [...base, { __create: trimmed }] : base;
    // selectedList is derived from props.value each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, showCreate, trimmed, getKey, props.multiple, props.value]);

  const handleCreate = async (text: string) => {
    const created = await onCreate?.(text);
    if (!created) return;
    if (props.multiple) props.onChange([...props.value, created]);
    else props.onChange(created);
    setQuery("");
  };

  const handleValue = (next: unknown) => {
    if (props.multiple) {
      const arr = (next as (T | CreateItem)[]) ?? [];
      const create = arr.find(isCreate);
      if (create) return void handleCreate(create.__create);
      props.onChange(arr as T[]);
      setQuery("");
    } else {
      if (isCreate(next)) return void handleCreate(next.__create);
      props.onChange((next as T | null) ?? null);
    }
  };

  const toKey = (x: T | CreateItem) => (isCreate(x) ? `__create:${x.__create}` : getKey(x));
  const toLabel = (x: T | CreateItem) => (isCreate(x) ? x.__create : getLabel(x));

  const input = (
    <BaseCombobox.Input
      placeholder={props.multiple && props.value.length ? undefined : placeholder}
      aria-label={props["aria-label"]}
      autoFocus={autoFocus}
      autoComplete="off"
      enterKeyHint="search"
      onKeyDown={(e) => {
        // Base UI clears the selection on Escape while the popup is closed, so "Escape to dismiss
        // the sheet" would silently wipe the field. Skip that: the key reaches the sheet instead.
        // (With the popup open, Escape still just closes the popup.)
        if (e.key === "Escape" && e.currentTarget.getAttribute("aria-expanded") !== "true") e.preventBaseUIHandler();
      }}
      className="h-8 min-w-24 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-4"
    />
  );

  return (
    <BaseCombobox.Root<T | CreateItem, boolean>
      items={items}
      multiple={props.multiple}
      value={(props.multiple ? props.value : props.value) as never}
      onValueChange={handleValue}
      inputValue={props.multiple ? query : undefined}
      onInputValueChange={(v, d) => {
        setQuery(v);
        if (d.reason !== "item-press") run(v);
      }}
      onOpenChange={(open, d) => {
        // Typing opens the popup right after it ran (or scheduled) its own search; running
        // another one here would cancel that pending debounced search.
        if (!open || d.reason === "input-change") return;
        // Opened by click/arrow keys: search what's typed, or everything when the field just
        // shows the current selection.
        const showsSelection = !props.multiple && props.value !== null && query === getLabel(props.value);
        run(showsSelection ? "" : query);
      }}
      itemToStringLabel={toLabel}
      isItemEqualToValue={(a, b) => toKey(a) === toKey(b)}
      filter={null}
      disabled={disabled}
      id={id}
    >
      <BaseCombobox.InputGroup
        aria-invalid={invalid || undefined}
        className={cn(
          "flex min-h-11 w-full flex-wrap items-center gap-1.5 rounded-sm border-[0.5px] border-hairline bg-surface-2 px-3 py-1.5 shadow-e1 transition-[box-shadow,border-color] duration-150 focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--focus-ring)] aria-invalid:border-danger",
          disabled && "opacity-50",
          className,
        )}
      >
        {props.multiple ? (
          // The input sits inside Chips: Base UI's Backspace-removes-the-last-chip and arrow-key
          // chip navigation only work there.
          <BaseCombobox.Chips className="contents">
            {props.value.map((item) => (
              <BaseCombobox.Chip
                key={getKey(item)}
                className="inline-flex h-7 max-w-full items-center gap-1 rounded-full bg-accent-soft pr-1 pl-2.5 text-footnote font-medium text-accent-text outline-none data-[highlighted]:ring-2 data-[highlighted]:ring-[var(--focus-ring)]"
              >
                <span className="truncate">{getLabel(item)}</span>
                <BaseCombobox.ChipRemove aria-label={`Remove ${getLabel(item)}`} className="grid size-5 place-items-center rounded-full hover:bg-accent-soft">
                  <X size={12} strokeWidth={2.6} />
                </BaseCombobox.ChipRemove>
              </BaseCombobox.Chip>
            ))}
            {input}
          </BaseCombobox.Chips>
        ) : (
          input
        )}
        {loading && <Spinner size={16} className="text-fg-3" />}
        {!props.multiple && props.value && !loading && (
          <BaseCombobox.Clear aria-label="Clear" className="grid size-6 place-items-center rounded-full bg-fill-2 text-fg-3 hover:bg-fill-3">
            <X size={13} strokeWidth={2.6} />
          </BaseCombobox.Clear>
        )}
      </BaseCombobox.InputGroup>
      <BaseCombobox.Portal>
        <BaseCombobox.Positioner className="ui-positioner" align="start" sideOffset={6} collisionPadding={12}>
          <BaseCombobox.Popup aria-busy={loading || undefined} className={cn(popupSurface, "w-[var(--anchor-width)] max-w-[var(--available-width)]")}>
            <BaseCombobox.Empty className="px-3 py-5 text-center text-subhead text-fg-3 empty:hidden">
              {loading ? "Searching…" : emptyText}
            </BaseCombobox.Empty>
            <BaseCombobox.List className={popupScroll}>
              {(item: T | CreateItem) =>
                isCreate(item) ? (
                  <BaseCombobox.Item key={toKey(item)} value={item} className={cn(menuItem, "text-accent-text [&_svg]:text-accent-text")}>
                    <Plus />
                    <span className="truncate">Create “{item.__create}”</span>
                  </BaseCombobox.Item>
                ) : (
                  <BaseCombobox.Item key={getKey(item)} value={item} className={cn(menuItem, "h-auto min-h-9 py-1 pr-8")}>
                    <div className="min-w-0 flex-1">{renderItem(item, { selected: selectedKeys.has(getKey(item)) })}</div>
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
