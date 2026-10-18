"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { Combobox } from "@/components/ui/Combobox";
import { api } from "@/lib/api";
import { keys } from "@/lib/queries/keys";
import { cityToLocation } from "@/lib/queries/misc";
import type { City } from "@/lib/queries/types";
import type { LocationInput } from "@/lib/schemas";
import { flag } from "@/lib/utils";

type Props = {
  value: LocationInput | null;
  onChange: (v: LocationInput | null) => void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
};

/** A selected place as a Combobox item (locations may predate the cities table, so key by name too). */
type Item = { key: string; location: LocationInput };

const toItem = (location: LocationInput): Item => ({ key: location.cityId ? `city:${location.cityId}` : `${location.name}|${location.country}`, location });

export const cityLabel = (l: Pick<LocationInput, "name" | "country">) => `${l.name}, ${l.country}`;

/**
 * City search over the GeoNames dataset (`/api/geocode`), cached per query in memory so repeat
 * searches are instant (lookups are volatile and never persisted to the device). Diacritic-
 * insensitive on the server ("ljublj" → Ljubljana).
 */
export function CityPicker({ value, onChange, placeholder = "City", autoFocus, disabled, id, ...aria }: Props) {
  const qc = useQueryClient();
  const selected = useMemo(() => (value ? toItem(value) : null), [value]);

  const search = useCallback(
    async (q: string): Promise<Item[]> => {
      const text = q.trim();
      if (text.length < 2) return [];
      const cities = await qc.fetchQuery({
        queryKey: keys.cities(text),
        queryFn: () => api.get<City[]>(`/api/geocode?q=${encodeURIComponent(text)}`),
        staleTime: 60 * 60_000,
        // One entry per typed prefix: kept in memory for the session, never persisted.
        gcTime: 60 * 60_000,
        meta: { persist: false },
      });
      return cities.map((c) => toItem(cityToLocation(c)));
    },
    [qc],
  );

  return (
    <Combobox<Item>
      id={id}
      value={selected}
      onChange={(item) => onChange(item?.location ?? null)}
      search={search}
      debounceMs={140}
      getKey={(i) => i.key}
      getLabel={(i) => cityLabel(i.location)}
      placeholder={placeholder}
      emptyText="Search by city name"
      autoFocus={autoFocus}
      disabled={disabled}
      invalid={aria["aria-invalid"]}
      aria-label={aria["aria-label"] ?? placeholder}
      renderItem={({ location: l }) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden className="w-6 shrink-0 text-center text-title3 leading-none">
            {flag(l.countryCode)}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium">{l.name}</span>
            <span className="block truncate text-footnote text-fg-3">{[l.admin && l.admin !== l.name ? l.admin : null, l.country].filter(Boolean).join(" · ")}</span>
          </span>
        </span>
      )}
    />
  );
}
