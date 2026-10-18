"use client";
import { useMemo, useState } from "react";
import { GlassButton } from "@/components/glass/GlassButton";
import { SearchField } from "@/components/ui/SearchField";
import { Sheet } from "@/components/ui/Sheet";
import { ToggleChip } from "@/components/ui/ToggleChip";
import { normalizeForSearch } from "@/components/ui/search";
import {
  activeFacetCount,
  clearFacets,
  FACET_LABEL,
  FACETS,
  facetCounts,
  facetSelection,
  filterPeople,
  toggleFacetValue,
  withFacet,
  type Facet,
  type PeopleFilters,
  type PeopleRow,
} from "@/lib/filters/people-filters";
import { cn } from "@/lib/utils";
import { freezeOrder, inOrder, SEARCHABLE, withMissingSelected, type FacetOption, type FacetOptions } from "./facet-options";

export type FacetSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: PeopleFilters;
  onChange: (next: PeopleFilters) => void;
  people: readonly PeopleRow[];
  options: FacetOptions;
  facets?: readonly Facet[];
};

const COLLAPSED = 12;

/**
 * Every facet in one sheet (the phone's "Filters" button). Chips apply live; the footer button
 * shows how many people match right now and closes the sheet.
 */
export function FacetSheet({ open, onOpenChange, filters, onChange, people, options, facets = FACETS }: FacetSheetProps) {
  const matching = useMemo(() => (open ? filterPeople(people, filters).length : 0), [open, people, filters]);
  const active = activeFacetCount(filters) > 0;
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Filters"
      size="large"
      headerLeft={
        <button
          type="button"
          disabled={!active}
          onClick={() => onChange(clearFacets(filters))}
          className="pressable inline-flex h-11 min-w-11 items-center rounded-full px-2 text-body text-accent-text hover:bg-accent-soft disabled:pointer-events-none disabled:opacity-40"
        >
          Clear all
        </button>
      }
      done="Done"
      footer={
        <GlassButton variant="primary" size="lg" className="w-full" onClick={() => onOpenChange(false)}>
          {matching === 0 ? "No people match" : `Show ${matching} ${matching === 1 ? "person" : "people"}`}
        </GlassButton>
      }
    >
      <div className="space-y-6 pt-2 pb-2">
        {facets.map((facet) => (
          <FacetSection key={facet} facet={facet} options={options[facet]} filters={filters} onChange={onChange} people={people} />
        ))}
      </div>
    </Sheet>
  );
}

function FacetSection({
  facet,
  options: known,
  filters,
  onChange,
  people,
}: {
  facet: Facet;
  options: readonly FacetOption[];
  filters: PeopleFilters;
  onChange: (next: PeopleFilters) => void;
  people: readonly PeopleRow[];
}) {
  const selected = facetSelection(filters, facet);
  const options = withMissingSelected(facet, known, selected);
  const counts = useMemo(() => facetCounts(people, filters, facet), [people, filters, facet]);
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const long = SEARCHABLE[facet] && options.length > COLLAPSED;

  const [order] = useState(() => freezeOrder(facet, options, selected, counts));
  const ordered = inOrder(options, order);
  const terms = normalizeForSearch(query).split(" ").filter(Boolean);
  const matched = terms.length ? ordered.filter((o) => terms.every((t) => o.search.includes(t))) : ordered;
  const visible = long && !expanded && !terms.length ? matched.slice(0, COLLAPSED) : matched;
  if (!options.length) return null;

  return (
    <section aria-labelledby={`facet-${facet}`}>
      <div className="mb-2.5 flex min-h-8 items-center justify-between gap-3 px-1">
        <h3 id={`facet-${facet}`} className="text-headline text-fg">
          {FACET_LABEL[facet]}
          {selected.length > 0 && <span className="ml-1.5 text-subhead font-normal text-fg-3 tabular-nums">{selected.length}</span>}
        </h3>
        {selected.length > 0 && (
          <button type="button" onClick={() => onChange(withFacet(filters, facet, []))} className="pressable hit-44 rounded-full px-2 text-subhead text-accent-text">
            Clear
          </button>
        )}
      </div>
      {long && (
        <SearchField value={query} onChange={setQuery} placeholder={`Search ${FACET_LABEL[facet].toLowerCase()}`} aria-label={`Search ${FACET_LABEL[facet].toLowerCase()}`} className="mb-3" />
      )}
      <div className="flex flex-wrap gap-2">
        {visible.map((o) => {
          const n = counts.get(o.value) ?? 0;
          const on = selected.includes(o.value);
          return (
            <ToggleChip
              key={o.value}
              pressed={on}
              onPressedChange={() => onChange(toggleFacetValue(filters, facet, o.value))}
              color={o.color}
              icon={o.chipIcon}
              className={cn(n === 0 && !on && "opacity-50")}
            >
              {o.glyph && <span aria-hidden>{o.glyph}</span>}
              {o.label}
              <span className="tabular-nums opacity-60">{n}</span>
            </ToggleChip>
          );
        })}
        {long && !terms.length && matched.length > COLLAPSED && (
          <button type="button" onClick={() => setExpanded((e) => !e)} className="pressable hit-44 h-8 rounded-full px-3 text-footnote font-medium text-accent-text hover:bg-accent-soft">
            {expanded ? "Show less" : `Show all ${matched.length}`}
          </button>
        )}
        {terms.length > 0 && matched.length === 0 && <p className="px-1 py-2 text-subhead text-fg-3">No matches for “{query.trim()}”</p>}
      </div>
    </section>
  );
}
