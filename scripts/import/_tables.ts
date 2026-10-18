/** Tables an import can touch, in insert (dependency) order. Used by backup/restore. */
export const BACKUP_TABLES = [
  "locations",
  "categories",
  "people",
  "notes",
  "note_mentions",
  "reminders",
  "person_categories",
  "tags",
  "person_tags",
  "activities",
  "person_activities",
  "import_jobs",
  "import_items",
  "import_people",
  "import_mentions",
  "import_commit_log",
] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];
