"use client";
import { Check } from "lucide-react";
import { useMemo, useState, type KeyboardEvent } from "react";
import { ResponsivePopover } from "@/components/ui/ResponsivePopover";
import { SearchField } from "@/components/ui/SearchField";
import { normalizeForSearch } from "@/components/ui/search";
import { FACET_LABEL, facetCounts, facetSelection, withFacet, type Facet, type PeopleFilters, type PeopleRow } from "@/lib/filters/people-filters";
import { useIsPhone } from "@/lib/media";
import { cn } from "@/lib/utils";
import { freezeOrder, inOrder, SEARCHABLE, selectionLabel, withMissingSelected, type FacetOption } from "./facet-options";
import { FilterPill } from "./FilterPill";

export type FacetListProps = {
  facet: Facet;
  options: readonly FacetOption[];
  filters: PeopleFilters;
  onChange: (next: PeopleFilters) => void;
  people: readonly PeopleRow[];
  /** Larger rows (phone sheet). */
  touch?: boolean;
  className?: string;
};

const SEARCH_THRESHOLD = 8;

/** Arrow-key movement between checklist rows (and from the search field into the list). */
function onListKeyDown(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  const root = e.currentTarget;
  const rows = Array.from(root.querySelectorAll<HTMLElement>("[data-facet-row]"));
  if (!rows.length) return;
  const i = rows.indexOf(document.activeElement as HTMLElement);
  const next = e.key === "ArrowDown" ? rows[Math.min(i + 1, rows.length - 1)] : i <= 0 ? root.querySelector<HTMLElement>("input") ?? rows[0] : rows[i - 1];
  if (next) {
    e.preventDefault();
    next.focus();
  }
}

/**
 * Multi-select checklist for one facet with live counts (given every other active filter).
 * Long facets (activities, tags, cities) get a diacritic-insensitive search; their order is
 * frozen when the list opens (selected first, then most people) so rows don't jump while you tick.
 */
export function FacetList({ facet, options: known, filters, onChange, people, touch, className }: FacetListProps) {
  const selected = facetSelection(filters, facet);
  const options = useMemo(() => withMissingSelected(facet, known, selected), [facet, known, selected]);
  const counts = useMemo(() => facetCounts(people, filters, facet), [people, filters, facet]);
  const [query, setQuery] = useState("");
  const searchable = SEARCHABLE[facet] && options.length > SEARCH_THRESHOLD;

  const [order] = useState(() => freezeOrder(facet, options, selected, counts));
  const ordered = useMemo(() => inOrder(options, order), [options, order]);
  const terms = normalizeForSearch(query).split(" ").filter(Boolean);
  const visible = terms.length ? ordered.filter((o) => terms.every((t) => o.search.includes(t))) : ordered;

  const toggle = (value: string) => {
    const next = selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
    onChange(withFacet(filters, facet, next));
  };

  return (
    <div className={cn("flex min-h-0 flex-col", className)} onKeyDown={onListKeyDown}>
      {searchable && (
        <SearchField
          value={query}
          onChange={setQuery}
          // First Escape clears the search; only an empty field lets Escape close the popover.
          onKeyDown={(e) => {
            if (e.key === "Escape" && query) e.stopPropagation();
          }}
          placeholder={`Search ${FACET_LABEL[facet].toLowerCase()}`}
          aria-label={`Search ${FACET_LABEL[facet].toLowerCase()}`}
          className={cn("mb-2 shrink-0", touch ? "" : "h-9")}
        />
      )}
      <div role="group" aria-label={FACET_LABEL[facet]} className={cn("min-h-0 overflow-y-auto overscroll-contain", !touch && "max-h-[min(360px,calc(var(--available-height,480px)-96px))]")}>
        {visible.map((o) => {
          const on = selected.includes(o.value);
          const n = counts.get(o.value) ?? 0;
          return (
            <button
              key={o.value}
              type="button"
              role="checkbox"
              aria-checked={on}
              data-facet-row=""
              onClick={() => toggle(o.value)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-xs px-2 text-left outline-none transition-colors duration-100 focus-visible:bg-fill-2 [@media(hover:hover)]:hover:bg-fill-1 active:bg-fill-2",
                touch ? "h-12 text-body" : "h-9 text-subhead pointer-coarse:h-11",
                n === 0 && !on && "opacity-50",
              )}
            >
              {o.leading}
              <span className="min-w-0 flex-1 truncate">
                {o.label}
                {o.detail && <span className="text-fg-3"> · {o.detail}</span>}
              </span>
              <span className="shrink-0 text-footnote text-fg-3 tabular-nums">{n}</span>
              <span className={cn("grid size-5 shrink-0 place-items-center text-accent-text transition-opacity duration-100", on ? "opacity-100" : "opacity-0")}>
                <Check size={17} strokeWidth={3} aria-hidden />
              </span>
            </button>
          );
        })}
        {visible.length === 0 && (
          <p className="px-2 py-6 text-center text-subhead text-fg-3">{options.length ? `No matches for “${query.trim()}”` : `No ${FACET_LABEL[facet].toLowerCase()} yet`}</p>
        )}
      </div>
    </div>
  );
}

export type FacetPillProps = {
  facet: Facet;
  options: readonly FacetOption[];
  filters: PeopleFilters;
  onChange: (next: PeopleFilters) => void;
  people: readonly PeopleRow[];
  className?: string;
};

/** A facet pill that opens its checklist: anchored popover on desktop, bottom sheet on phones. */
export function FacetPill({ facet, options, filters, onChange, people, className }: FacetPillProps) {
  const isPhone = useIsPhone();
  const [open, setOpen] = useState(false);
  const selected = facetSelection(filters, facet);
  const label = FACET_LABEL[facet];
  return (
    <ResponsivePopover
      open={open}
      onOpenChange={setOpen}
      title={label}
      done="Done"
      className="w-[min(320px,var(--available-width))] p-2"
      trigger={
        <FilterPill
          label={selectionLabel(label, options, selected)}
          active={selected.length > 0}
          onClear={() => onChange(withFacet(filters, facet, []))}
          clearLabel={`Clear ${label.toLowerCase()} filter`}
          aria-label={selected.length ? `${label}: ${selected.length} selected` : label}
          className={className}
        />
      }
    >
      <FacetList facet={facet} options={options} filters={filters} onChange={onChange} people={people} touch={isPhone} />
      {selected.length > 0 && !isPhone && (
        <div className="mt-1 flex justify-end border-t-[0.5px] border-separator px-1 pt-1.5">
          <button
            type="button"
            onClick={() => onChange(withFacet(filters, facet, []))}
            className="pressable h-8 rounded-full px-3 text-footnote font-medium text-accent-text hover:bg-accent-soft"
          >
            Clear
          </button>
        </div>
      )}
    </ResponsivePopover>
  );
}
