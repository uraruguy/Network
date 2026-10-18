/**
 * Read-only verification of an import. Exit 1 on any failure.
 *   pnpm tsx scripts/import/verify.ts [--run <id>] [--source apple-notes]
 * Checks: every Apple note is committed | dismissed(reason) | locked | in review; committed notes
 * are verbatim (sha1(trim(content_text)) = content_hash) under the right person; mentions linked;
 * excerpts are substrings; every mention is assigned (or dismissed); imported reminders are in the
 * future and ≤1 per person; duplicate display names; commit log matches the rows it created.
 */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { bootstrap, resolveOwner, run } from "./_env";

type Row = Record<string, unknown>;

run(async () => {
  const ctx = bootstrap();
  const owner = await resolveOwner(ctx);
  const { db } = await import("@/lib/db");
  const { sql } = await import("drizzle-orm");
  const { normalizeExtraction } = await import("@/lib/import/mentions");
  const q = async <T = Row>(s: ReturnType<typeof sql>) => (await db.execute(s)) as unknown as T[];
  const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");

  const failures: Record<string, string[]> = {};
  const warnings: Record<string, string[]> = {};
  const fail = (k: string, msg: string) => (failures[k] ??= []).push(msg);
  const warn = (k: string, msg: string) => (warnings[k] ??= []).push(msg);

  const items = await q<{ id: string; external_id: string; title: string | null; text: string; status: string; dismissed_reason: string | null; note_id: string | null; content_hash: string | null; candidates: unknown; extraction_version: number | null }>(sql`
    select id, external_id, title, text, status, dismissed_reason, note_id, content_hash, candidates, extraction_version
    from import_items where owner_id = ${owner.id} and source = ${ctx.source} and gone_at is null`);
  // person_deleted: the proposal's person was deleted in The Network (commits skip it on purpose).
  const props = await q<{ id: string; key: string; status: string; disposition: string; merged_into_id: string | null; committed_person_id: string | null; needs_review: boolean; person_deleted: boolean }>(sql`
    select p.id, p.key, p.status::text, p.disposition, p.merged_into_id, p.committed_person_id, p.needs_review,
           exists (select 1 from people x where x.id = coalesce(p.committed_person_id, p.match_person_id) and x.deleted_at is not null) as person_deleted
    from import_people p where p.owner_id = ${owner.id} and p.source = ${ctx.source}`);
  const mentions = await q<{ id: string; item_id: string; candidate_index: number | null; import_person_id: string | null; role: string; reason: string | null; excerpt: string | null }>(sql`
    select m.id, m.item_id, m.candidate_index, m.import_person_id, m.role, m.reason, m.excerpt
    from import_mentions m join import_items i on i.id = m.item_id where m.owner_id = ${owner.id} and i.source = ${ctx.source} and i.gone_at is null`);
  const propById = new Map(props.map((p) => [p.id, p]));
  const final = (id: string | null) => {
    let p = id ? propById.get(id) : undefined;
    for (let i = 0; p?.merged_into_id && i < 20; i++) p = propById.get(p.merged_into_id);
    return p ?? null;
  };
  const byItem = new Map<string, typeof mentions>();
  for (const m of mentions) byItem.set(m.item_id, [...(byItem.get(m.item_id) ?? []), m]);

  // 1. Every note accounted for.
  const buckets: Record<string, number> = {};
  const bump = (k: string) => (buckets[k] = (buckets[k] ?? 0) + 1);
  for (const it of items) {
    const label = `“${it.title ?? "(untitled)"}” (${it.id})`;
    if (it.status === "committed") bump("committed");
    else if (it.status === "skipped") {
      if (!it.dismissed_reason) fail("note-status", `${label} skipped without a reason`);
      else bump(it.dismissed_reason === "locked" ? "locked" : `dismissed:${it.dismissed_reason.split(":")[0]}`);
    } else if (it.status === "extracted") {
      const ms = byItem.get(it.id) ?? [];
      const cands = normalizeExtraction(it.candidates, it.extraction_version).candidates;
      const unresolved = cands.filter((c) => {
        const m = ms.find((x) => x.candidate_index === c.index);
        return !m || (!m.import_person_id && !(m.reason ?? "").startsWith("dismissed"));
      });
      if (unresolved.length) {
        fail("note-status", `${label} has ${unresolved.length} unresolved mention(s)`);
        continue;
      }
      const roles = ms.filter((m) => m.role !== "mention");
      if (!roles.length) {
        bump("in-review:unfiled");
        continue;
      }
      const ps = roles.map((m) => final(m.import_person_id)).filter((p) => p && p.disposition === "person");
      const deleted = ps.filter((p) => p!.person_deleted);
      if (ps.some((p) => p!.status === "proposed")) bump("in-review:person");
      else if (ps.some((p) => p!.status === "approved" && !p!.person_deleted)) fail("note-status", `${label} has approved people that are not committed (run commit)`);
      else if (deleted.length) {
        bump("kept:person-deleted");
        warn("deleted-people", `${label} is not filed: ${deleted.map((p) => p!.key).join(", ")} deleted in The Network`);
      }
      else if (roles.some((m) => m.role === "primary" && final(m.import_person_id)?.status === "rejected")) fail("note-status", `${label} is filed under a rejected person (re-run file-notes)`);
      else bump("in-review:other");
    } else fail("note-status", `${label} is still ${it.status} (stage incomplete)`);
  }

  // 2–4. Committed notes: verbatim, right person, mentions linked; excerpts substrings.
  const committed = items.filter((i) => i.status === "committed");
  const noteIds = committed.map((i) => i.note_id).filter((x): x is string => !!x);
  // edited: changed in the app since the import last wrote it (same rule as the commit, which keeps it).
  const lastWrite = sql`(select row_key->>'id' as id, max(created_at) as at from import_commit_log where owner_id = ${owner.id} and table_name = 'notes' group by 1)`;
  const notes = noteIds.length
    ? await q<{ id: string; person_id: string; content_text: string; source_kind: string | null; source_ref: string | null; deleted_at: string | null; edited: boolean }>(sql`
        select n.id, n.person_id, n.content_text, n.source_kind, n.source_ref, n.deleted_at,
               (n.content_json is not null or n.updated_at > coalesce(w.at, n.created_at)) as edited
        from notes n left join ${lastWrite} w on w.id = n.id::text
        where n.id in (${sql.join(noteIds.map((i) => sql`${i}::uuid`), sql`, `)})`)
    : [];
  const noteById = new Map(notes.map((n) => [n.id, n]));
  const links = noteIds.length
    ? await q<{ note_id: string; person_id: string }>(sql`select note_id, person_id from note_mentions where note_id in (${sql.join(noteIds.map((i) => sql`${i}::uuid`), sql`, `)})`)
    : [];
  const linkSet = new Set(links.map((l) => `${l.note_id}|${l.person_id}`));
  const excerptNotes = await q<{ source_ref: string; content_text: string; person_id: string; deleted: boolean; edited: boolean }>(sql`
    select n.source_ref, n.content_text, n.person_id, n.deleted_at is not null as deleted,
           (n.content_json is not null or n.updated_at > coalesce(w.at, n.created_at)) as edited
    from notes n left join ${lastWrite} w on w.id = n.id::text
    where n.owner_id = ${owner.id} and n.source_kind = 'apple-notes' and n.source_ref like '%#%'
    order by n.deleted_at nulls first`);
  const excerptByRef = new Map<string, (typeof excerptNotes)[number]>();
  for (const n of excerptNotes) if (!excerptByRef.has(n.source_ref)) excerptByRef.set(n.source_ref, n); // live first
  let verbatim = 0;
  let excerptOk = 0;
  for (const it of committed) {
    const label = `“${it.title ?? "(untitled)"}”`;
    const ms = byItem.get(it.id) ?? [];
    const primary = ms.find((m) => m.role === "primary");
    if (it.note_id) {
      const n = noteById.get(it.note_id);
      if (!n) {
        fail("verbatim", `${label}: note ${it.note_id} missing`);
        continue;
      }
      if (n.deleted_at) {
        warn("kept", `${label}: deleted in The Network (stays deleted)`);
        continue;
      }
      if (n.source_ref !== it.external_id || n.source_kind !== "apple-notes") fail("verbatim", `${label}: source_ref ${n.source_ref} ≠ external_id`);
      if (sha1(n.content_text.trim()) === it.content_hash) verbatim++;
      else if (n.edited) warn("kept", `${label}: edited in The Network (the commit keeps your version)`);
      else fail("verbatim", `${label}: content_text hash ≠ content_hash`);
      if (primary) {
        const p = final(primary.import_person_id);
        if (!p?.committed_person_id) fail("primary", `${label}: primary proposal not committed`);
        else if (p.committed_person_id !== n.person_id) fail("primary", `${label}: filed under ${n.person_id}, expected ${p.committed_person_id} (${p.key})`);
        for (const m of ms) {
          if (m === primary) continue;
          const mp = final(m.import_person_id);
          if (mp?.committed_person_id && mp.committed_person_id !== n.person_id && !linkSet.has(`${n.id}|${mp.committed_person_id}`)) fail("mentions", `${label}: ${mp.key} not linked`);
        }
      } else warn("primary", `${label}: committed note without a primary mention (old-flow commit)`);
    } else {
      for (const m of ms.filter((x) => x.role === "listed" || x.role === "excerpt")) {
        const p = final(m.import_person_id);
        if (!p || p.disposition !== "person" || p.status === "rejected") continue;
        const n = excerptByRef.get(`${it.external_id}#${p.key}`);
        if (!n) {
          if (p.committed_person_id && !p.person_deleted) fail("excerpts", `${label}: excerpt note for ${p.key} missing`);
          continue;
        }
        if (n.deleted) {
          warn("kept", `${label}: excerpt for ${p.key} deleted in The Network (stays deleted)`);
          continue;
        }
        if (it.text.includes(n.content_text)) excerptOk++;
        else if (n.edited) warn("kept", `${label}: excerpt for ${p.key} edited in The Network (kept)`);
        else fail("excerpts", `${label}: excerpt for ${p.key} is not a substring of the note`);
        if (p.committed_person_id && n.person_id !== p.committed_person_id) fail("excerpts", `${label}: excerpt for ${p.key} filed under the wrong person`);
      }
    }
  }

  // 5. Mentions assigned or dismissed.
  let unassigned = 0;
  for (const m of mentions) if (m.candidate_index != null && !m.import_person_id && !(m.reason ?? "").startsWith("dismissed")) unassigned++;
  if (unassigned) fail("mentions-assigned", `${unassigned} mentions are neither assigned nor dismissed`);

  // 6. Imported reminders.
  const rem = await q<{ id: string; person_id: string; due_at: string; created_at: string; status: string }>(sql`
    select id, person_id, due_at, created_at, status::text from reminders where owner_id = ${owner.id} and source_kind = 'apple-notes'`);
  const perPerson = new Map<string, number>();
  for (const r of rem) {
    perPerson.set(r.person_id, (perPerson.get(r.person_id) ?? 0) + 1);
    if (new Date(r.due_at) <= new Date(r.created_at)) fail("reminders", `reminder ${r.id} was due before it was created`);
    if (r.status === "pending" && new Date(r.due_at) < new Date()) warn("reminders", `reminder ${r.id} is overdue`);
  }
  for (const [pid, n] of perPerson) if (n > 1) fail("reminders", `person ${pid} has ${n} imported reminders`);

  // 7. Duplicate display names.
  const dups = await q<{ name: string; n: number }>(sql`
    select lower(unaccent(display_name)) as name, count(*)::int as n from people where owner_id = ${owner.id} and deleted_at is null group by 1 having count(*) > 1 order by 2 desc`);
  for (const d of dups) warn("duplicate-names", `${d.name} ×${d.n}`);

  // 8. Commit log ↔ rows.
  const logRows = await q<{ table_name: string; op: string; row_key: Record<string, string> }>(sql`
    select table_name, op, row_key from import_commit_log where owner_id = ${owner.id} and source = ${ctx.source}`);
  const loggedPeople = new Set(logRows.filter((r) => r.table_name === "people" && r.op === "insert").map((r) => r.row_key.id));
  const loggedNotes = new Set(logRows.filter((r) => r.table_name === "notes" && r.op === "insert").map((r) => r.row_key.id));
  const importPeopleRows = await q<{ id: string }>(sql`select id from people where owner_id = ${owner.id} and source_ref like 'import-person:%'`);
  for (const p of importPeopleRows) if (!loggedPeople.has(p.id)) fail("commit-log", `person ${p.id} (import-person) has no log entry`);
  for (const id of loggedPeople) if (!importPeopleRows.some((p) => p.id === id)) warn("commit-log", `logged person ${id} no longer exists`);
  const importNotes = await q<{ id: string }>(sql`
    select id from notes where owner_id = ${owner.id} and source_kind = 'apple-notes' and (source_ref like 'apple-notes:facts:%' or source_ref like '%#%') and deleted_at is null`);
  for (const n of importNotes) if (!loggedNotes.has(n.id)) fail("commit-log", `note ${n.id} has no log entry`);
  for (const p of props) {
    if (p.status === "committed" && !p.committed_person_id) fail("commit-log", `proposal ${p.key} committed without a person`);
  }

  const total = Object.values(failures).reduce((s, v) => s + v.length, 0);
  console.log(`notes: ${items.length} live · ${JSON.stringify(buckets)}`);
  console.log(`verbatim notes ok: ${verbatim} · excerpts ok: ${excerptOk} · imported reminders: ${rem.length} · proposals: ${props.length}`);
  for (const [k, v] of Object.entries(failures)) console.log(`✗ ${k} (${v.length})\n  ${v.slice(0, 20).join("\n  ")}${v.length > 20 ? `\n  … ${v.length - 20} more` : ""}`);
  for (const [k, v] of Object.entries(warnings)) console.log(`! ${k} (${v.length})\n  ${v.slice(0, 10).join("\n  ")}${v.length > 10 ? `\n  … ${v.length - 10} more` : ""}`);
  writeFileSync(join(ctx.runDir, "verify.json"), JSON.stringify({ at: new Date().toISOString(), buckets, verbatim, excerptOk, failures, warnings }, null, 2));
  console.log(total ? `FAILED: ${total} problem(s)` : "OK");
  return total ? 1 : 0;
});
