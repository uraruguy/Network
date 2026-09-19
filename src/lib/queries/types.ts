import type { PersonDetail, PersonListItem } from "@/lib/data/people";
import type { getNote, recentNotes } from "@/lib/data/notes";
import type { globeData } from "@/lib/data/people";
import type { getProfile } from "@/lib/data/profile";
import type { Category, City } from "@/lib/db/schema";

export type { PersonDetail, PersonListItem, Category, City };
export type NoteDetail = NonNullable<Awaited<ReturnType<typeof getNote>>>;
export type RecentNote = Awaited<ReturnType<typeof recentNotes>>[number];
export type GlobeEntry = Awaited<ReturnType<typeof globeData>>[number];
export type ProfileDetail = NonNullable<Awaited<ReturnType<typeof getProfile>>>;
