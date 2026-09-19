export const keys = {
  people: (filters?: Record<string, string | undefined>) => ["people", filters ?? {}] as const,
  person: (id: string) => ["person", id] as const,
  note: (id: string) => ["note", id] as const,
  recentNotes: () => ["notes", "recent"] as const,
  categories: () => ["categories"] as const,
  globe: () => ["globe"] as const,
  profile: () => ["profile"] as const,
  cities: (q: string) => ["cities", q] as const,
};
