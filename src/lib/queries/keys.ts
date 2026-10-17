/**
 * TanStack Query keys. Prefixes matter: invalidating ["people"] refreshes the index and every
 * search; ["person", id] is one profile; ["notes"] covers recent notes, searches and timelines.
 * The cache holds raw API shapes (persisted to IndexedDB), adapters run in the hooks.
 */
type Filters = Record<string, string | string[] | undefined>;

export const keys = {
  /** @deprecated v1 list key; the list is now derived from `peopleIndex`. */
  people: (filters?: Record<string, string | undefined>) => ["people", filters ?? {}] as const,
  peopleIndex: () => ["people", "index"] as const,
  peopleSearch: (filters: Filters) => ["people", "search", filters] as const,
  person: (id: string) => ["person", id] as const,
  personNotes: (personId: string) => ["notes", "person", personId] as const,
  note: (id: string) => ["note", id] as const,
  recentNotes: () => ["notes", "recent"] as const,
  noteSearch: (q: string, personId?: string) => ["notes", "search", q, personId ?? null] as const,
  reminders: (opts?: { until?: string; personId?: string }) => ["reminders", opts ?? {}] as const,
  categories: () => ["categories"] as const,
  activities: () => ["activities"] as const,
  tags: () => ["tags"] as const,
  taxonomy: () => ["taxonomy"] as const,
  stats: () => ["stats"] as const,
  globe: (filters?: Filters) => (filters ? (["globe", filters] as const) : (["globe"] as const)),
  graph: (filters?: Filters) => (filters ? (["graph", filters] as const) : (["graph"] as const)),
  profile: () => ["profile"] as const,
  cities: (q: string) => ["cities", q] as const,
};
