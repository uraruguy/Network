/**
 * API response types for the client. Type-only imports from the server modules (erased at build
 * time, so no server code reaches the bundle). Wire format note: Date fields arrive as ISO strings.
 */
import type { ActivityRow } from "@/lib/data/activities";
import type { GraphLink, GraphNode } from "@/lib/data/graph";
import type { NoteDetail, NoteSearchHit, recentNotes, listNotes } from "@/lib/data/notes";
import type { globeData, IndexLocation, NoteSummary, PersonDetail as PersonDetailApi, PersonIndexRow, peopleByPlace } from "@/lib/data/people";
import type { getProfile, Stats } from "@/lib/data/profile";
import type { TagRow, listTaxonomy } from "@/lib/data/tags";
import type { Category, City } from "@/lib/db/schema";

export type { ActivityRow, Category, City, GraphLink, GraphNode, IndexLocation, NoteDetail, NoteSearchHit, NoteSummary, PersonDetailApi, PersonIndexRow, Stats, TagRow };
/** v1-compatible shapes still read by the current screens (see ./compat). */
export type { PersonDetail, PersonListItem } from "./compat";

export type RecentNoteApi = Awaited<ReturnType<typeof recentNotes>>[number];
export type RecentNote = RecentNoteApi & { contentText: string };
export type NotesPage = Awaited<ReturnType<typeof listNotes>>;
export type GlobeEntry = Awaited<ReturnType<typeof globeData>>[number];
export type ProfileDetail = NonNullable<Awaited<ReturnType<typeof getProfile>>>;
export type Taxonomy = Awaited<ReturnType<typeof listTaxonomy>>;
export type PeopleByPlace = Awaited<ReturnType<typeof peopleByPlace>>;
export type PeopleSearchPage = { items: (PersonIndexRow & { score?: number })[]; nextCursor: string | null };
