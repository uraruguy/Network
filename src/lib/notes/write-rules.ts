/**
 * Server-side rules for note writes (pure; unit-tested in write-rules.test.ts):
 *
 * - No empty notes, ever: creating one is refused (422); a write that would leave a note with no
 *   words soft-deletes it instead — what the app does when you clear a note — and never stores
 *   the empty state, so a restore brings the last words back.
 * - A restore never revives blank content: blank fields in a restoring write are ignored.
 * - A content save based on content that changed meanwhile is refused (409, see ./version).
 */
import { isBlankContent } from "./title";
import { isStaleWrite } from "./version";

/** True when a note has no words at all (title, text and Markdown blank). */
export const isBlankNote = (n: { title?: string | null; contentText?: string | null; contentMd?: string | null }) => isBlankContent(n) && !n.contentMd?.trim();

export type StoredNoteState = { title: string | null; contentText: string; contentMd: string; deletedAt: Date | string | null };

export type NoteWriteInput = {
  personId?: string;
  title?: string | null;
  contentText?: string;
  contentMd?: string;
  contentJson?: unknown;
  restore?: boolean;
  baseVersions?: readonly string[];
};

export type NoteWritePlan =
  | { kind: "create" }
  /** `keepContent`: apply everything but the content fields (a restore that carried blank content). */
  | { kind: "update"; keepContent: boolean }
  | { kind: "delete-empty" }
  | { kind: "gone" }
  | { kind: "conflict" }
  | { kind: "invalid"; message: string };

export const touchesContent = (w: NoteWriteInput) => w.title !== undefined || w.contentText !== undefined || w.contentMd !== undefined || w.contentJson !== undefined;

/** What a PUT/PATCH does to the note as stored (`row` null: it doesn't exist yet). */
export function planNoteWrite(row: StoredNoteState | null, w: NoteWriteInput): NoteWritePlan {
  if (!row) {
    if (!w.personId) return { kind: "invalid", message: "personId is required to create a note" };
    if (isBlankNote(w)) return { kind: "invalid", message: "A note needs a title or some text" };
    return { kind: "create" };
  }
  if (row.deletedAt && !w.restore) return { kind: "gone" };
  if (!touchesContent(w)) return { kind: "update", keepContent: false };
  if (!w.restore && isStaleWrite({ baseVersions: w.baseVersions, current: row, incoming: w })) return { kind: "conflict" };
  const next = {
    title: w.title !== undefined ? w.title : row.title,
    contentText: w.contentText ?? row.contentText,
    contentMd: w.contentMd ?? row.contentMd,
  };
  if (!isBlankNote(next)) return { kind: "update", keepContent: false };
  if (!w.restore) return { kind: "delete-empty" };
  return isBlankNote(row) ? { kind: "invalid", message: "This note is empty, so there is nothing to restore" } : { kind: "update", keepContent: true };
}
