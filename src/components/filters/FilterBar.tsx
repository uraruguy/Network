"use client";
import { SlidersHorizontal } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { SearchField } from "@/components/ui/SearchField";
import { activeFacetCount, clearFacets, FACETS, facetSelection, selectedValueCount, type Facet, type PeopleFilters } from "@/lib/filters/people-filters";
import type { SortKey } from "@/lib/filters/sort";
import { spring } from "@/lib/motion";
import type { PersonIndexRow } from "@/lib/queries/types";
import { cn } from "@/lib/utils";
import { FacetPill } from "./FacetPicker";
import { FacetSheet } from "./FacetSheet";
import { useFacetOptions } from "./facet-options";
import { FilterPill } from "./FilterPill";
import { SortMenu } from "./SortMenu";

/**
 * Search + facet pills (Category / Warmth / Activities / Tags / City), multi-select with live counts.
 * `variant="map"` is the compact glass-map version used over the globe.
 */
export type FilterBarProps = {
  filters: PeopleFilters;
  onChange: (next: PeopleFilters) => void;
  /** Rows the counts are computed from (the full index, not the filtered result). */
  people: readonly PersonIndexRow[];
  facets?: Facet[];
  showSearch?: boolean;
  variant?: "page" | "map";
  className?: string;
  /** Adds a Sort pill first (people list). */
  sort?: SortKey;
  onSortChange?: (sort: SortKey) => void;
  searchPlaceholder?: string;
  searchRef?: Ref<HTMLInputElement>;
  /** Page variant: stick under the status bar while scrolling (default true). */
  sticky?: boolean;
  /** Extra controls at the end of the pill row. */
  trailing?: ReactNode;
};

const pillMotion = { layout: "position" as const, transition: spring.snappy };

export function FilterBar({
  filters,
  onChange,
  people,
  facets = [...FACETS],
  showSearch,
  variant = "page",
  className,
  sort,
  onSortChange,
  searchPlaceholder = "Search people",
  searchRef,
  sticky = true,
  trailing,
}: FilterBarProps) {
  const map = variant === "map";
  const withSearch = showSearch ?? !map;
  const options = useFacetOptions(people);
  const [sheetOpen, setSheetOpen] = useState(false);
  const activeFacets = activeFacetCount(filters);
  const anyActive = activeFacets > 0;

  const search = withSearch && (
    <SearchField
      ref={searchRef}
      value={filters.q}
      onChange={(q) => onChange({ ...filters, q })}
      placeholder={searchPlaceholder}
      aria-label={searchPlaceholder}
      size={map ? "md" : "lg"}
      className={map ? "h-9" : undefined}
    />
  );

  const pills = (
    <motion.div
      layoutScroll
      role="toolbar"
      aria-label="Filters"
      className={cn("no-scrollbar flex items-center overflow-x-auto overscroll-x-contain", map ? "gap-1.5" : "-mx-4 gap-2 px-4 py-1.5 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10")}
    >
      {!map && (
        <motion.div {...pillMotion} className="sm:hidden">
          <FilterPill
            icon={<SlidersHorizontal strokeWidth={2.4} aria-hidden />}
            label={anyActive ? `Filters · ${selectedValueCount(filters)}` : "Filters"}
            active={anyActive}
            chevron={false}
            onClick={() => setSheetOpen(true)}
            aria-haspopup="dialog"
          />
        </motion.div>
      )}
      {sort && onSortChange && (
        <motion.div {...pillMotion}>
          <SortMenu value={sort} onChange={onSortChange} />
        </motion.div>
      )}
      {!map && sort && <span aria-hidden className="mx-0.5 h-5 w-[0.5px] shrink-0 bg-separator max-sm:hidden" />}
      {facets.map((facet) => {
        const on = facetSelection(filters, facet).length > 0;
        return (
          // On phones the Filters sheet holds the idle facets; only active ones stay in the row.
          <motion.div key={facet} {...pillMotion} className={cn(!map && !on && "max-sm:hidden")}>
            <FacetPill facet={facet} options={options[facet]} filters={filters} onChange={onChange} people={people} />
          </motion.div>
        );
      })}
      <AnimatePresence initial={false}>
        {anyActive && (
          <motion.button
            key="clear-all"
            type="button"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={spring.snappy}
            onClick={() => onChange(clearFacets(filters))}
            className="pressable hit-44 h-8 shrink-0 rounded-full px-2.5 text-footnote font-medium whitespace-nowrap text-accent-text hover:bg-accent-soft"
          >
            Clear all
          </motion.button>
        )}
      </AnimatePresence>
      {trailing}
    </motion.div>
  );

  if (map) {
    return (
      <div className={cn("glass-map flex min-w-0 flex-col", withSearch ? "gap-2 rounded-lg p-2" : "rounded-full p-1.5", className)}>
        {search}
        {pills}
      </div>
    );
  }

  return (
    <>
      <StickyBar sticky={sticky} className={className}>
        {search}
        <div className={withSearch ? "mt-1" : undefined}>{pills}</div>
      </StickyBar>
      <FacetSheet open={sheetOpen} onOpenChange={setSheetOpen} filters={filters} onChange={onChange} people={people} options={options} facets={facets} />
    </>
  );
}

/**
 * Sticks below the status bar; once content scrolls under it, a translucent material fades in
 * behind it (and the safe area above it), like an iOS navigation bar.
 */
function StickyBar({ sticky, className, children }: { sticky: boolean; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !sticky) return;
    let frame = 0;
    const check = () => {
      frame = 0;
      const top = parseFloat(getComputedStyle(el).top) || 0;
      setStuck(el.getBoundingClientRect().top <= top + 0.5 && window.scrollY > 0);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [sticky]);

  return (
    <div
      ref={ref}
      data-filter-bar=""
      data-stuck={stuck || undefined}
      className={cn("relative z-20 -mx-4 px-4 pt-1 pb-1 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10", sticky && "sticky top-[var(--sat)]", className)}
    >
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 top-[calc(-1*var(--sat))] bottom-0 -z-10 bg-surface-4 shadow-[0_0.5px_0_var(--hairline)] [-webkit-backdrop-filter:var(--blur-thick)] [backdrop-filter:var(--blur-thick)] transition-opacity duration-200",
          stuck ? "opacity-100" : "opacity-0",
        )}
      />
      {children}
    </div>
  );
}
