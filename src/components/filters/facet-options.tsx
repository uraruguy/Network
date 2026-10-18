"use client";
import { Hash } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { normalizeForSearch } from "@/components/ui/search";
import { CategoryIcon } from "@/components/people/CategoryIcon";
import { WARMTH } from "@/lib/constants";
import { paletteVar } from "@/lib/constants/palette";
import { citiesOf, type Facet, type PeopleRow } from "@/lib/filters/people-filters";
import { useCategories } from "@/lib/queries/people";
import { useActivities, useTags } from "@/lib/queries/taxonomy";
import { flag, WARMTH_META } from "@/lib/utils";

export type FacetOption = {
  value: string;
  label: string;
  /** Secondary text (a city's country). */
  detail?: string;
  /** Short prefix for compact labels (emoji, flag). */
  glyph?: string;
  /** Leading visual in checklists. */
  leading?: ReactNode;
  /** Chip tint (stored category / tag colour) and small chip icon. */
  color?: string;
  chipIcon?: ReactNode;
  /** Normalized label + detail for diacritic-insensitive search. */
  search: string;
};

export type FacetOptions = Record<Facet, FacetOption[]>;

/** Long, open-ended facets get a search field and selected-first ordering. */
export const SEARCHABLE: Record<Facet, boolean> = { category: false, warmth: false, activity: true, tag: true, city: true };

/**
 * Display order for a facet's options, captured when a picker opens so rows don't jump while you
 * tick: categories/warmth keep their natural order; activities keep the user's order with
 * selected first and empty ones last; tags and cities go selected first, then most people.
 */
export function freezeOrder(facet: Facet, options: readonly FacetOption[], selected: readonly string[], counts: ReadonlyMap<string, number>): Map<string, number> {
  const sel = new Set(selected);
  const n = (o: FacetOption) => counts.get(o.value) ?? 0;
  const bySelected = (a: FacetOption, b: FacetOption) => Number(sel.has(b.value)) - Number(sel.has(a.value));
  const sorted =
    facet === "activity"
      ? [...options].sort((a, b) => bySelected(a, b) || Number(n(b) > 0) - Number(n(a) > 0))
      : facet === "tag" || facet === "city"
        ? [...options].sort((a, b) => bySelected(a, b) || n(b) - n(a))
        : options;
  return new Map(sorted.map((o, i) => [o.value, i]));
}

const UNKNOWN_LABEL: Record<Facet, string> = { category: "Unknown category", warmth: "Unknown", activity: "Unknown activity", tag: "Unknown tag", city: "Unknown city" };

/**
 * `options` plus a row for every selected value that no longer exists (a deleted tag in an old
 * link), so it can still be unticked instead of silently filtering everyone out.
 */
export function withMissingSelected(facet: Facet, options: readonly FacetOption[], selected: readonly string[]): readonly FacetOption[] {
  const known = new Set(options.map((o) => o.value));
  const missing = selected.filter((v) => !known.has(v));
  if (!missing.length) return options;
  return [
    ...options,
    ...missing.map((value) => ({
      value,
      label: UNKNOWN_LABEL[facet],
      search: normalizeForSearch(UNKNOWN_LABEL[facet]),
      leading: (
        <span aria-hidden className="grid size-6 shrink-0 place-items-center">
          <span className="size-1.5 rounded-full bg-fg-4" />
        </span>
      ),
    })),
  ];
}

/** `options` in a frozen order (values that appeared after opening go last, in their own order). */
export function inOrder(options: readonly FacetOption[], order: ReadonlyMap<string, number>): FacetOption[] {
  const at = (o: FacetOption) => order.get(o.value) ?? order.size;
  return [...options].sort((a, b) => at(a) - at(b));
}

const opt = (o: Omit<FacetOption, "search">): FacetOption => ({ ...o, search: normalizeForSearch(`${o.label} ${o.detail ?? ""}`) });

export function WarmthSwatch({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden className={className ?? "size-2.5 shrink-0 rounded-full"} style={{ background: color }} />;
}

/** Options for every facet, from the taxonomy caches and (for cities) the people index itself. */
export function useFacetOptions(people: readonly PeopleRow[]): FacetOptions {
  const { data: categories } = useCategories();
  const { data: activities } = useActivities();
  const { data: tags } = useTags();
  return useMemo(() => {
    const category = [...(categories ?? [])]
      .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
      .map((c) =>
        opt({
          value: c.id,
          label: c.name,
          color: c.color,
          chipIcon: <CategoryIcon name={c.icon} />,
          leading: (
            <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full text-white" style={{ background: paletteVar(c.color) }}>
              <CategoryIcon name={c.icon} size={13} />
            </span>
          ),
        }),
      );
    const warmth = WARMTH.map((w) =>
      opt({
        value: w,
        label: WARMTH_META[w].label,
        leading: <WarmthSwatch color={WARMTH_META[w].color} />,
        chipIcon: <WarmthSwatch color={WARMTH_META[w].color} className="size-2 shrink-0 rounded-full ring-1 ring-white/60" />,
      }),
    );
    const activity = [...(activities ?? [])]
      .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
      .map((a) =>
        opt({
          value: a.id,
          label: a.name,
          glyph: a.emoji ?? undefined,
          leading: (
            <span aria-hidden className="grid size-6 shrink-0 place-items-center text-callout">
              {a.emoji ?? <span className="size-1.5 rounded-full bg-fg-4" />}
            </span>
          ),
        }),
      );
    const tag = [...(tags ?? [])]
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .map((t) =>
        opt({
          value: t.id,
          label: t.name,
          color: t.color ?? undefined,
          chipIcon: <Hash />,
          leading: (
            <span aria-hidden className="grid size-6 shrink-0 place-items-center" style={{ color: t.color ? paletteVar(t.color) : "var(--fg-3)" }}>
              <Hash size={15} strokeWidth={2.4} />
            </span>
          ),
        }),
      );
    const city = citiesOf(people).map((l) => {
      const f = flag(l.countryCode);
      return opt({
        value: l.id,
        label: l.name,
        detail: l.country,
        glyph: f || undefined,
        leading: (
          <span aria-hidden className="grid size-6 shrink-0 place-items-center text-callout">
            {f || <span className="size-1.5 rounded-full bg-fg-4" />}
          </span>
        ),
      });
    });
    return { category, warmth, activity, tag, city };
  }, [categories, activities, tags, people]);
}

/** Pill text for a facet's selection: "Filter name", "⚽️ Football", "Activities · 2". */
export function selectionLabel(label: string, options: readonly FacetOption[], selected: readonly string[]): string {
  if (selected.length === 0) return label;
  if (selected.length === 1) {
    const o = options.find((x) => x.value === selected[0]);
    if (o) return o.glyph ? `${o.glyph} ${o.label}` : o.label;
  }
  return `${label} · ${selected.length}`;
}
