/** Apple Notes folders named after a person ("Peter", "Blaž") vs context folders ("SF", "Goolets"). */
import { deaccent, nicknameCanon } from "./names";

/** Folders known to be named after people in Jakob's notes. */
export const DEFAULT_PERSON_FOLDERS = ["Peter", "Blaz", "Blaž", "Sanja", "Nejc", "Kaja"];

/** Folders that look like a single name but are contexts (companies, places, topics). */
export const CONTEXT_FOLDERS = [
  "Notes", "Business", "Health", "Goals", "Razno", "Lajf", "WIN", "EYE", "SF", "Cassi", "Goolets", "PackOpti", "Linkedin", "Crypo", "Locked",
  "Sommaroy", "Sommarøy", "Q-goals", "Uraru AI", "Meeting Notes", "Dnevno dogajanje",
];

const fold = (s: string) => deaccent(s.normalize("NFC")).toLowerCase().trim();
const CONTEXT = new Set(CONTEXT_FOLDERS.map(fold));

/**
 * A folder is person-named when it is in the default list, or it is a single capitalised word
 * that is not a known context folder and matches the first name of ≥2 extracted candidates.
 */
export function isPersonFolder(folder: string | null | undefined, firstNameCounts?: Map<string, number>, extra: string[] = []): boolean {
  if (!folder) return false;
  const f = fold(folder);
  if ([...DEFAULT_PERSON_FOLDERS, ...extra].some((p) => fold(p) === f)) return true;
  if (CONTEXT.has(f)) return false;
  if (!/^\p{Lu}[\p{Ll}]+$/u.test(folder.normalize("NFC").trim())) return false;
  return (firstNameCounts?.get(f) ?? 0) + (firstNameCounts?.get(nicknameCanon(f)) ?? 0) >= 2;
}

/** The person-named folder of a note, if any. */
export function personFolderOf(folders: string[], firstNameCounts?: Map<string, number>, extra: string[] = []): string | null {
  return folders.find((f) => isPersonFolder(f, firstNameCounts, extra)) ?? null;
}

export function isJournalFolder(folders: string[]) {
  return folders.some((f) => fold(f) === "dnevno dogajanje");
}
