/** Export-vs-database diff for incremental Apple Notes imports (pure). */
import { createHash } from "node:crypto";
import { z } from "zod";

export const ExportRowV2 = z.object({
  id: z.string(),
  title: z.string().nullable().default(null),
  html: z.string().nullable().default(null),
  text: z.string().nullable().default(null),
  created: z.string().nullable().default(null),
  modified: z.string().nullable().default(null),
  folder: z.string().nullable().default(null),
  folders: z.array(z.string()).optional(),
  account: z.string().nullable().optional(),
  locked: z.boolean().optional(),
});
export type ExportRowV2 = z.infer<typeof ExportRowV2>;

export type CleanRow = Omit<ExportRowV2, "folders" | "text"> & { text: string; folders: string[]; hash: string };

export const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");
/** Content hash of a note: sha1 of its trimmed plain text (matches import_items.content_hash). */
export const contentHash = (text: string | null | undefined) => sha1((text ?? "").trim());

/** Parses an export and collapses duplicate ids (same note in two folders) into `folders[]`. */
export function cleanRows(raw: unknown[]): { rows: CleanRow[]; duplicates: number } {
  const byId = new Map<string, CleanRow>();
  let duplicates = 0;
  for (const r of raw) {
    const p = ExportRowV2.parse(r);
    const folders = (p.folders?.length ? p.folders : p.folder ? [p.folder] : []).map((f) => f.normalize("NFC")).filter(Boolean);
    const prev = byId.get(p.id);
    if (prev) {
      duplicates++;
      for (const f of folders) if (!prev.folders.includes(f)) prev.folders.push(f);
      continue;
    }
    const text = (p.text ?? "").trim();
    byId.set(p.id, { ...p, folder: folders[0] ?? null, folders, text, hash: sha1(text) });
  }
  return { rows: [...byId.values()], duplicates };
}

export type ExistingItem = { id: string; externalId: string; contentHash: string | null; status: string; title: string | null; html: string | null; folders: string[]; goneAt: Date | null; noteId: string | null };

export type DiffKind = "new" | "changed" | "unchanged" | "meta" | "gone" | "locked" | "returned";
export type DiffEntry = { kind: DiffKind; externalId: string; title: string | null; itemId?: string; prevStatus?: string; row?: CleanRow };

const sameFolders = (a: string[], b: string[]) => a.length === b.length && a.every((f) => b.includes(f));

/** Classifies every export row against the import_items already in the database. */
export function diffAgainstItems(rows: CleanRow[], existing: ExistingItem[]): DiffEntry[] {
  const byExt = new Map(existing.map((e) => [e.externalId, e]));
  const seen = new Set<string>();
  const out: DiffEntry[] = [];
  for (const r of rows) {
    seen.add(r.id);
    const e = byExt.get(r.id);
    if (r.locked) {
      out.push({ kind: "locked", externalId: r.id, title: r.title, itemId: e?.id, prevStatus: e?.status, row: r });
      continue;
    }
    if (!e) out.push({ kind: "new", externalId: r.id, title: r.title, row: r });
    else if (e.contentHash !== r.hash) out.push({ kind: "changed", externalId: r.id, title: r.title, itemId: e.id, prevStatus: e.status, row: r });
    else if (e.goneAt) out.push({ kind: "returned", externalId: r.id, title: r.title, itemId: e.id, prevStatus: e.status, row: r });
    else if (e.title !== r.title || (e.html ?? null) !== (r.html ?? null) || !sameFolders(e.folders, r.folders)) out.push({ kind: "meta", externalId: r.id, title: r.title, itemId: e.id, prevStatus: e.status, row: r });
    else out.push({ kind: "unchanged", externalId: r.id, title: r.title, itemId: e.id, prevStatus: e.status });
  }
  for (const e of existing) if (!seen.has(e.externalId) && !e.goneAt) out.push({ kind: "gone", externalId: e.externalId, title: e.title, itemId: e.id, prevStatus: e.status });
  return out;
}

/** File-vs-file diff (previous export → new export) by id + content hash. */
export function diffFiles(prev: CleanRow[], next: CleanRow[]) {
  const p = new Map(prev.map((r) => [r.id, r]));
  const n = new Map(next.map((r) => [r.id, r]));
  const res = { new: [] as string[], changed: [] as string[], unchanged: 0, titleOnly: [] as string[], gone: [] as string[] };
  for (const r of next) {
    const o = p.get(r.id);
    if (!o) res.new.push(r.title ?? r.id);
    else if (o.hash !== r.hash) res.changed.push(r.title ?? r.id);
    else if (o.title !== r.title || o.html !== r.html) res.titleOnly.push(r.title ?? r.id);
    else res.unchanged++;
  }
  for (const r of prev) if (!n.has(r.id)) res.gone.push(r.title ?? r.id);
  return res;
}

export function summarizeDiff(entries: DiffEntry[]) {
  const counts: Record<string, number> = {};
  for (const e of entries) {
    const k = e.kind === "changed" || e.kind === "meta" || e.kind === "gone" ? `${e.kind}:${e.prevStatus}` : e.kind;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}
