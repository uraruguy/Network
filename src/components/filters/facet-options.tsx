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
