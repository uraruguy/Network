"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "./keys";
import type { City, GlobeEntry, GraphLink, GraphNode, Stats } from "./types";
import type { LocationInput } from "@/lib/schemas";

/** Optional id filters shared by the globe and the graph (each matches ANY of the given ids). */
export type MapFilters = { category?: string[]; activity?: string[]; tag?: string[] };

function filterQs(f?: MapFilters) {
  const p = new URLSearchParams();
  for (const [k, ids] of Object.entries(f ?? {})) if (ids?.length) p.set(k, ids.join(","));
  const s = p.toString();
  return s ? `?${s}` : "";
}
const hasFilters = (f?: MapFilters) => !!f && Object.values(f).some((v) => v?.length);

export function useCitySearch(q: string) {
  return useQuery({
    queryKey: keys.cities(q),
    queryFn: () => api.get<City[]>(`/api/geocode?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
    staleTime: 60 * 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useGlobe(filters?: MapFilters) {
  return useQuery({
    queryKey: keys.globe(hasFilters(filters) ? filters : undefined),
    queryFn: () => api.get<GlobeEntry[]>(`/api/globe${filterQs(filters)}`),
    placeholderData: (prev) => prev,
  });
}

export function useGraph(filters?: MapFilters) {
  return useQuery({
    queryKey: keys.graph(hasFilters(filters) ? filters : undefined),
    queryFn: () => api.get<{ nodes: GraphNode[]; links: GraphLink[] }>(`/api/graph${filterQs(filters)}`),
    placeholderData: (prev) => prev,
  });
}

/** {people, cities, dueToday, overdue, upcoming7d} — "today" in the profile timezone. */
export function useStats() {
  return useQuery({ queryKey: keys.stats(), queryFn: () => api.get<Stats>("/api/stats") });
}

// Moved to ./settings; re-exported so existing imports keep working.
export { useProfile, useUpdateProfile } from "./settings";

export function cityToLocation(c: City): LocationInput {
  return { cityId: c.id, name: c.name, admin: c.admin, country: c.country, countryCode: c.countryCode, lat: c.lat, lng: c.lng, timezone: c.timezone };
}
