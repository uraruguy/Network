/**
 * Rollback safety (pure): imported people that can't be hard-deleted because the user has built on
 * them since — anything referencing the person that the rolled-back commits did not write. Deleting
 * the person would cascade it away (notes, reminders, categories, tags, activities, mentions in the
 * user's own notes) or silently unlink it (other people's introducedBy, chat threads).
 */

export type CommitLogRow = { tableName: string; op: string; rowKey: Record<string, string>; before: unknown };

/** `other`: the referencing row (note, reminder, category, tag, activity, note of the mention, introduced person, chat thread). */
export type BlockerRef = { kind: "note" | "reminder" | "category" | "tag" | "activity" | "mention" | "introduced" | "chat"; personId: string; other: string };

const LABEL: Record<BlockerRef["kind"], string> = {
  note: "note",
  reminder: "reminder",
  category: "category",
  tag: "tag",
  activity: "activity",
  mention: "mentioned in note",
  introduced: "introduced person",
  chat: "chat thread",
};

export function rollbackBlockers(insertedPeople: string[], rows: CommitLogRow[], refs: BlockerRef[]): Map<string, string[]> {
  const inserted = new Set(insertedPeople);
  const inserts = (t: string) => rows.filter((r) => r.tableName === t && r.op === "insert");
  const ids = (t: string) => new Set(inserts(t).map((r) => r.rowKey.id));
  const pairs = (t: string, a: string, b: string) => new Set(inserts(t).map((r) => `${r.rowKey[a]}|${r.rowKey[b]}`));
  const notes = ids("notes");
  const reminders = ids("reminders");
  const links = { category: pairs("person_categories", "person_id", "category_id"), tag: pairs("person_tags", "person_id", "tag_id"), activity: pairs("person_activities", "person_id", "activity_id") };
  const mentions = pairs("note_mentions", "note_id", "person_id");
  const introductions = new Set(rows.filter((r) => r.tableName === "people" && r.op === "update" && !!r.before && typeof r.before === "object" && "introduced_by_id" in r.before).map((r) => r.rowKey.id));
  const written = (r: BlockerRef) => {
    switch (r.kind) {
      case "note":
        return notes.has(r.other);
      case "reminder":
        return reminders.has(r.other);
      case "category":
      case "tag":
      case "activity":
        return links[r.kind].has(`${r.personId}|${r.other}`);
      case "mention":
        return notes.has(r.other) || mentions.has(`${r.other}|${r.personId}`);
      case "introduced":
        // Set by the import, or on someone the rollback deletes anyway (their own refs are checked).
        return introductions.has(r.other) || inserted.has(r.other);
      case "chat":
        return false;
    }
  };
  const out = new Map<string, string[]>();
  for (const r of refs) {
    if (!inserted.has(r.personId) || written(r)) continue;
    out.set(r.personId, [...(out.get(r.personId) ?? []), `${LABEL[r.kind]} ${r.other}`]);
  }
  return out;
}
