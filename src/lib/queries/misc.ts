"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "./keys";
import type { City, GlobeEntry, ProfileDetail } from "./types";
import type { LocationInput } from "@/lib/schemas";

export function useCitySearch(q: string) {
  return useQuery({
    queryKey: keys.cities(q),
    queryFn: () => api.get<City[]>(`/api/geocode?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
    staleTime: 60 * 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useGlobe() {
  return useQuery({ queryKey: keys.globe(), queryFn: () => api.get<GlobeEntry[]>("/api/globe") });
}

export function useProfile() {
  return useQuery({ queryKey: keys.profile(), queryFn: () => api.get<ProfileDetail>("/api/profile"), staleTime: 5 * 60_000 });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: { displayName?: string | null; timezone?: string; digestHour?: number; digestEnabled?: boolean; homeLocation?: LocationInput | null }) =>
      api.patch<ProfileDetail>("/api/profile", patch),
    onSuccess: (data) => {
      qc.setQueryData(keys.profile(), data);
      qc.invalidateQueries({ queryKey: keys.globe() });
    },
  });
}

export function cityToLocation(c: City): LocationInput {
  return { cityId: c.id, name: c.name, admin: c.admin, country: c.country, countryCode: c.countryCode, lat: c.lat, lng: c.lng, timezone: c.timezone };
}
