/**
 * Resolution + filing data layer: loads the inputs prepare.ts packs for subagents, applies their
 * ResolutionFile / FilingFile outputs to import_people + import_mentions, runs the auto-decision
 * policy and cross-packet reconciliation.
 */
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { importItemsX, importMentions, importPeople, type ImportPerson } from "@/lib/db/schema-import";
import type { Anchor, FilingFile, ResolutionFile, ResolvePacket } from "@/lib/import/contracts";
import { decideFiling, type FilingDecision, type FilingInput, type FilingMention, type FilingPerson } from "@/lib/import/filing";
import { personFolderOf } from "@/lib/import/folders";
import type { ItemForMentions } from "@/lib/import/mentions";
import { normalizeExtraction } from "@/lib/import/mentions";
import { deaccent, nameTokens, nicknameCanon, normName } from "@/lib/import/names";
import { decidePolicy } from "@/lib/import/policy";
import { mergeProfiles, readProfile } from "@/lib/import/profile";
import type { DbOrTx, Tx } from "./import-shared";

const live = (ownerId: string, source: string) => and(eq(importItemsX.ownerId, ownerId), eq(importItemsX.source, source), isNull(importItemsX.goneAt));

/* ------------------------------------------------------------------ */
/*  Loaders                                                            */
/* ------------------------------------------------------------------ */

export async function loadExtractedItems(db: DbOrTx, ownerId: string, source: string): Promise<(ItemForMentions & { externalId: string; html: string | null })[]> {
  const rows = await db
    .select({
      id: importItemsX.id,
      externalId: importItemsX.externalId,
      title: importItemsX.title,
      text: importItemsX.text,
      html: importItemsX.html,
      folders: importItemsX.folders,
      created: importItemsX.externalCreatedAt,
      classification: importItemsX.classification,
      extractionVersion: importItemsX.extractionVersion,
      candidates: importItemsX.candidates,
    })
    .from(importItemsX)
    .where(and(live(ownerId, source), eq(importItemsX.status, "extracted")));
  return rows;
}

export async function loadMentionRows(db: DbOrTx, ownerId: string, source: string) {
  return db
    .select({
      id: importMentions.id,
      itemId: importMentions.itemId,
      candidateIndex: importMentions.candidateIndex,
      surface: importMentions.surface,
      importPersonId: importMentions.importPersonId,
      role: importMentions.role,
      confidence: importMentions.confidence,
      reason: importMentions.reason,
      excerpt: importMentions.excerpt,
    })
    .from(importMentions)
    .innerJoin(importItemsX, eq(importItemsX.id, importMentions.itemId))
    .where(and(eq(importMentions.ownerId, ownerId), eq(importItemsX.source, source)));
}

export async function loadProposals(db: DbOrTx, ownerId: string, source: string) {
  return db.select().from(importPeople).where(and(eq(importPeople.ownerId, ownerId), eq(importPeople.source, source)));
}

/** Existing people and live proposals, as anchors for clustering and resolution. */
export async function loadAnchors(db: DbOrTx, ownerId: string, source: string): Promise<Anchor[]> {
  const people = await db.execute(sql`
    select p.id, p.display_name, p.first_name, p.last_name, p.headline, p.company, l.name as city,
           (select count(*)::int from notes n where n.person_id = p.id and n.deleted_at is null) as notes
    from people p left join locations l on l.id = p.home_location_id
    where p.owner_id = ${ownerId} and p.deleted_at is null`);
  const proposals = await db
    .select()
    .from(importPeople)
    .where(and(eq(importPeople.ownerId, ownerId), eq(importPeople.source, source), ne(importPeople.status, "merged")));
  // A person already represented by a proposal (committed or matched) is shown once, as the proposal.
  const represented = new Set(proposals.flatMap((p) => [p.committedPersonId, p.matchPersonId]).filter(Boolean));
  const anchors: Anchor[] = (people as unknown as Record<string, unknown>[]).filter((p) => !represented.has(String(p.id))).map((p) => ({
    kind: "person",
    id: String(p.id),
    key: null,
    displayName: String(p.display_name),
    aliases: [],
    summary: [p.headline, p.company, p.city, `${p.notes} notes`].filter(Boolean).join(" · "),
    status: null,
  }));
  for (const p of proposals) {
    const prof = readProfile(p.profile);
    anchors.push({
      kind: "proposal",
      id: p.id,
      key: p.key,
      displayName: p.displayName,
      aliases: p.aliases,
      summary: [p.disposition !== "person" ? p.disposition : null, prof.role, prof.company, prof.city, prof.keyFacts[0], p.decidedBy === "user" ? "decided by Jakob" : null].filter(Boolean).join(" · "),
      status: p.status,
    });
  }
  return anchors;
}

/* ------------------------------------------------------------------ */
/*  Apply a resolution file                                            */
/* ------------------------------------------------------------------ */

export type ApplyResolutionResult = { inserted: number; merged: number; enriched: number; untouched: number; mentions: number; dismissedMentions: number; keptUserMentions: number };

/** first/last name ride along in the profile jsonb (the row only has display_name). */
type StoredNames = { firstName?: string | null; lastName?: string | null };

function addFlags(flags: string[], ...more: (string | false | null | undefined)[]) {
  return [...new Set([...flags, ...more.filter((x): x is string => !!x)])];
}

export async function applyResolution(tx: Tx, ownerId: string, source: string, file: ResolutionFile, packet: ResolvePacket, fileName: string): Promise<ApplyResolutionResult> {
  const res: ApplyResolutionResult = { inserted: 0, merged: 0, enriched: 0, untouched: 0, mentions: 0, dismissedMentions: 0, keptUserMentions: 0 };
  const existing = await tx
    .select()
    .from(importPeople)
    .where(and(eq(importPeople.ownerId, ownerId), eq(importPeople.source, source)))
    .for("update");
  const byKey = new Map(existing.map((p) => [p.key, p]));
  const touched = new Set<string>();

  for (const p of file.people) {
    const flags = addFlags(p.reviewFlags, p.possibleSameAs.length > 0 && "possible_duplicate", p.needsReview && p.reviewFlags.length === 0 && "user_attention");
    const reasons = p.possibleSameAs.length ? `${p.reasons} [possible same as: ${p.possibleSameAs.join(", ")}]`.slice(0, 600) : p.reasons;
    const prev = byKey.get(p.key);
    if (prev && (prev.status === "merged" || (prev.decidedBy === "user" && prev.status !== "approved" && prev.status !== "committed"))) {
      res.untouched++;
      continue;
    }
    if (prev && (prev.decidedBy === "user" || prev.status === "committed")) {
      // Decided by Jakob or already committed: never change the decision or the name — only enrich
      // the profile (fill blanks, union lists). A committed person goes back to approved so the next
      // commit fills the new blanks on the person and merges the new facts.
      const names = prev.profile as StoredNames;
      await tx
        .update(importPeople)
        .set({
          aliases: [...new Set([...prev.aliases, ...p.aliases])].filter((a) => a !== prev.displayName),
          profile: { ...mergeProfiles(readProfile(prev.profile), p.profile), firstName: names.firstName ?? p.firstName, lastName: names.lastName ?? p.lastName },
          status: prev.status === "committed" ? "approved" : prev.status,
          proposalFile: prev.proposalFile && !prev.proposalFile.includes(fileName) ? `${prev.proposalFile},${fileName}` : fileName,
        })
        .where(eq(importPeople.id, prev.id));
      res.enriched++;
      continue;
    }
    if (prev) {
      const [row] = await tx
        .update(importPeople)
        .set({
          displayName: p.displayName.length > prev.displayName.length ? p.displayName : prev.displayName,
          aliases: [...new Set([...prev.aliases, ...p.aliases])],
          disposition: prev.disposition === "person" || p.disposition === "person" ? "person" : p.disposition,
          profile: {
            ...mergeProfiles(readProfile(prev.profile), p.profile),
            firstName: (prev.profile as StoredNames).firstName ?? p.firstName,
            lastName: (prev.profile as StoredNames).lastName ?? p.lastName,
          },
          confidence: Math.min(prev.confidence ?? 1, p.confidence),
          reasons: prev.reasons && !prev.reasons.includes(p.reasons) ? `${prev.reasons} | ${reasons}`.slice(0, 900) : reasons,
          reviewFlags: addFlags(prev.reviewFlags.filter((f) => f !== "stale"), ...flags, prev.disposition !== p.disposition && "conflicting_facts"),
          matchPersonId: prev.matchPersonId ?? p.existingPersonId,
          engine: file.engine,
          proposalFile: prev.proposalFile && !prev.proposalFile.includes(fileName) ? `${prev.proposalFile},${fileName}` : fileName,
        })
        .where(eq(importPeople.id, prev.id))
        .returning();
      byKey.set(p.key, row!);
      touched.add(prev.id);
      res.merged++;
    } else {
      const [row] = await tx
        .insert(importPeople)
        .values({
          ownerId,
          source,
          key: p.key,
          displayName: p.displayName,
          aliases: p.aliases,
          disposition: p.disposition,
          profile: { ...p.profile, firstName: p.firstName, lastName: p.lastName },
          confidence: p.confidence,
          reasons,
          reviewFlags: flags,
          matchPersonId: p.existingPersonId,
          engine: file.engine,
          proposalFile: fileName,
        })
        .returning();
      byKey.set(p.key, row!);
      touched.add(row!.id);
      res.inserted++;
    }
  }

  // Assignments → import_mentions (one row per candidate mention).
  const mentions = new Map(packet.mentions.map((m) => [m.mentionId, m]));
  const userOwned = new Set(existing.filter((p) => p.decidedBy === "user" || p.status === "committed" || p.status === "merged").map((p) => p.id));
  for (const a of file.assignments) {
    const m = mentions.get(a.mentionId);
    if (!m) continue;
    const person = a.personKey ? byKey.get(a.personKey) : null;
    const current = await tx
      .select({ id: importMentions.id, importPersonId: importMentions.importPersonId })
      .from(importMentions)
      .where(and(eq(importMentions.itemId, m.itemId), eq(importMentions.candidateIndex, m.index)));
    const cur = current[0];
    if (cur?.importPersonId && userOwned.has(cur.importPersonId) && cur.importPersonId !== person?.id) {
      res.keptUserMentions++;
      continue;
    }
    const values = {
      surface: m.surface,
      importPersonId: person?.id ?? null,
      confidence: a.confidence,
      reason: person ? a.reason : `dismissed: ${a.reason ?? "not a person"}`,
      evidence: m.snippets[0] ?? null,
      excerpt: m.excerpt,
    };
    if (cur) await tx.update(importMentions).set(values).where(eq(importMentions.id, cur.id));
    else await tx.insert(importMentions).values({ ownerId, itemId: m.itemId, candidateIndex: m.index, role: "mention", ...values });
    if (person) {
      touched.add(person.id);
      res.mentions++;
    } else res.dismissedMentions++;
  }

  await recomputePolicy(tx, ownerId, source, [...touched]);
  return res;
}

/* ------------------------------------------------------------------ */
/*  Policy                                                             */
/* ------------------------------------------------------------------ */

/** Re-evaluates auto decisions (never touches proposals Jakob decided, merged or committed ones). */
export async function recomputePolicy(tx: Tx, ownerId: string, source: string, ids?: string[]) {
  if (ids && !ids.length) return { approved: 0, rejected: 0, review: 0 };
  const rows = await tx
    .select()
    .from(importPeople)
    .where(and(eq(importPeople.ownerId, ownerId), eq(importPeople.source, source), ids ? inArray(importPeople.id, ids) : undefined));
  const conf = await tx
    .select({ pid: importMentions.importPersonId, c: importMentions.confidence })
    .from(importMentions)
    .where(and(eq(importMentions.ownerId, ownerId), ids ? inArray(importMentions.importPersonId, ids) : undefined));
  const byPerson = new Map<string, number[]>();
  for (const r of conf) if (r.pid) byPerson.set(r.pid, [...(byPerson.get(r.pid) ?? []), r.c ?? 0]);
  const out = { approved: 0, rejected: 0, review: 0 };
  for (const p of rows) {
    if (p.decidedBy === "user" || p.status === "merged" || p.status === "committed") continue;
    const raw = p.profile as StoredNames;
    const d = decidePolicy({
      disposition: p.disposition,
      confidence: p.confidence ?? 0,
      reviewFlags: p.reviewFlags,
      displayName: p.displayName,
      firstName: raw.firstName ?? null,
      lastName: raw.lastName ?? null,
      mentionConfidences: byPerson.get(p.id) ?? [],
      existingPersonId: p.matchPersonId,
    });
    await tx
      .update(importPeople)
      .set({ status: d.status, needsReview: d.needsReview, decidedBy: d.status === "proposed" ? null : "auto", decidedAt: d.status === "proposed" ? null : new Date() })
      .where(eq(importPeople.id, p.id));
    if (d.status === "approved") out.approved++;
    else if (d.status === "rejected") out.rejected++;
    else out.review++;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Reconcile across packets                                           */
/* ------------------------------------------------------------------ */

export async function reconcile(tx: Tx, ownerId: string, source: string) {
  const report = { deletedEmpty: 0, duplicateGroups: [] as string[][], sharedMatch: [] as string[][], badIntroducers: [] as string[], unassignedMentions: 0, policy: { approved: 0, rejected: 0, review: 0 } };
  const props = await loadProposals(tx, ownerId, source);
  const counts = await tx
    .select({ pid: importMentions.importPersonId, n: sql<number>`count(*)::int` })
    .from(importMentions)
    .where(eq(importMentions.ownerId, ownerId))
    .groupBy(importMentions.importPersonId);
  const n = new Map(counts.map((c) => [c.pid, c.n]));

  // 1. Proposals without any mention (superseded keys) → delete, unless decided/committed/merged-into.
  const mergedTargets = new Set(props.map((p) => p.mergedIntoId).filter(Boolean));
  const empty = props.filter((p) => !n.get(p.id) && p.decidedBy !== "user" && p.status !== "committed" && p.status !== "merged" && !mergedTargets.has(p.id));
  if (empty.length) {
    await tx.delete(importPeople).where(inArray(importPeople.id, empty.map((p) => p.id)));
    report.deletedEmpty = empty.length;
  }
  const alive = props.filter((p) => !empty.includes(p) && p.status !== "merged");

  // 2. Same normalised display name under different keys, or one first-name-only proposal next to
  //    a full-name proposal with that first name (split clusters) → possible duplicates.
  const flag = async (ids: string[]) => {
    const target = alive.filter((p) => ids.includes(p.id) && p.decidedBy !== "user" && p.status !== "committed");
    for (const p of target) {
      if (p.reviewFlags.includes("possible_duplicate")) continue;
      await tx.update(importPeople).set({ reviewFlags: [...p.reviewFlags, "possible_duplicate"] }).where(eq(importPeople.id, p.id));
      p.reviewFlags = [...p.reviewFlags, "possible_duplicate"];
    }
  };
  const byName = new Map<string, ImportPerson[]>();
  for (const p of alive.filter((p) => p.disposition === "person")) byName.set(normName(p.displayName), [...(byName.get(normName(p.displayName)) ?? []), p]);
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    report.duplicateGroups.push(group.map((p) => p.key));
    await flag(group.map((p) => p.id));
  }
  // 3. Two proposals matched to the same existing person.
  const byMatch = new Map<string, ImportPerson[]>();
  for (const p of alive) if (p.matchPersonId) byMatch.set(p.matchPersonId, [...(byMatch.get(p.matchPersonId) ?? []), p]);
  for (const group of byMatch.values()) {
    if (group.length < 2) continue;
    report.sharedMatch.push(group.map((p) => p.key));
    await flag(group.map((p) => p.id));
  }
  // 4. introducedByKey must point at a known key.
  const keys = new Set(alive.map((p) => p.key));
  for (const p of alive) {
    const k = readProfile(p.profile).introducedByKey;
    if (k && !keys.has(k)) report.badIntroducers.push(`${p.key} → ${k}`);
  }
  const [{ count }] = (await tx.execute(sql`
    select count(*)::int as count from import_mentions m join import_items i on i.id = m.item_id
    where m.owner_id = ${ownerId} and i.source = ${source} and i.gone_at is null and m.import_person_id is null
      and m.candidate_index is not null and coalesce(m.reason, '') not like 'dismissed:%'`)) as unknown as [{ count: number }];
  report.unassignedMentions = count;
  report.policy = await recomputePolicy(tx, ownerId, source);
  return report;
}

/* ------------------------------------------------------------------ */
/*  Filing                                                             */
/* ------------------------------------------------------------------ */

/** Follows merged_into chains so mentions of a merged proposal file under the surviving one. */
export function finalProposalResolver(props: ImportPerson[]) {
  const byId = new Map(props.map((p) => [p.id, p]));
  return (id: string | null): ImportPerson | null => {
    let cur = id ? byId.get(id) : undefined;
    for (let i = 0; cur && cur.mergedIntoId && i < 20; i++) cur = byId.get(cur.mergedIntoId);
    return cur ?? null;
  };
}

const toFilingPerson = (p: ImportPerson): FilingPerson => ({ proposalId: p.id, key: p.key, displayName: p.displayName, aliases: p.aliases, status: p.status, disposition: p.disposition });

export async function loadFilingInputs(db: DbOrTx, ownerId: string, source: string): Promise<FilingInput[]> {
  const items = await loadExtractedItems(db, ownerId, source);
  const mentions = await loadMentionRows(db, ownerId, source);
  const props = await loadProposals(db, ownerId, source);
  const final = finalProposalResolver(props);
  const byItem = new Map<string, typeof mentions>();
  for (const m of mentions) byItem.set(m.itemId, [...(byItem.get(m.itemId) ?? []), m]);

  // First-name counts of resolved people, to recognise person-named folders.
  const firstCounts = new Map<string, number>();
  for (const p of props) {
    const f = nameTokens(p.displayName)[0];
    if (f) firstCounts.set(f, (firstCounts.get(f) ?? 0) + 1);
  }
  // People per person-folder: proposals assigned to mentions in notes of that folder whose first name matches.
  const folderPeople = new Map<string, Map<string, ImportPerson>>();
  for (const it of items) {
    const pf = personFolderOf(it.folders, firstCounts);
    if (!pf) continue;
    const f = deaccent(pf).toLowerCase();
    for (const m of byItem.get(it.id) ?? []) {
      const p = final(m.importPersonId);
      if (!p || p.disposition !== "person") continue;
      const first = nameTokens(p.displayName)[0];
      if (first && (first === f || nicknameCanon(first) === nicknameCanon(f))) {
        const map = folderPeople.get(f) ?? new Map();
        map.set(p.id, p);
        folderPeople.set(f, map);
      }
    }
  }

  return items.map((it) => {
    const ex = normalizeExtraction(it.candidates, it.extractionVersion);
    const rows = byItem.get(it.id) ?? [];
    const pf = personFolderOf(it.folders, firstCounts);
    const fm: FilingMention[] = ex.candidates.map((c) => {
      const row = rows.find((r) => r.candidateIndex === c.index);
      const p = row ? final(row.importPersonId) : null;
      return {
        mentionId: `${it.id}:${c.index}`,
        candidateIndex: c.index,
        surface: c.name,
        salience: c.salience,
        confidence: c.confidence,
        person: p ? toFilingPerson(p) : null,
        dismissed: !!row && !row.importPersonId && (row.reason ?? "").startsWith("dismissed"),
      };
    });
    return {
      itemId: it.id,
      title: it.title,
      folders: it.folders,
      classification: it.classification,
      extractionVersion: ex.version,
      mentions: fm,
      personFolder: pf,
      folderCandidates: pf ? [...(folderPeople.get(deaccent(pf).toLowerCase())?.values() ?? [])].map(toFilingPerson) : [],
    };
  });
}

/** Writes the filing roles for one item: primary / mention / listed / excerpt. */
async function setRoles(tx: Tx, ownerId: string, itemId: string, decision: FilingDecision, excerpts?: Map<string, string>) {
  // Reset any previous filing for this item (keeps assignments).
  await tx.delete(importMentions).where(and(eq(importMentions.itemId, itemId), isNull(importMentions.candidateIndex)));
  await tx.update(importMentions).set({ role: "mention" }).where(and(eq(importMentions.itemId, itemId), ne(importMentions.role, "mention")));
  if (decision.mode === "primary") {
    const idx = Number(decision.primaryMentionId.split(":").at(-1));
    await tx.update(importMentions).set({ role: "primary" }).where(and(eq(importMentions.itemId, itemId), eq(importMentions.candidateIndex, idx)));
  } else if (decision.mode === "primary-folder") {
    await tx.insert(importMentions).values({
      ownerId,
      itemId,
      candidateIndex: null,
      surface: decision.person.displayName,
      importPersonId: decision.person.proposalId,
      role: "primary",
      confidence: 0.8,
      reason: decision.reason,
    });
  } else if (decision.mode === "list" || decision.mode === "journal") {
    const role = decision.mode === "list" ? "listed" : "excerpt";
    await tx
      .update(importMentions)
      .set({ role })
      .where(and(eq(importMentions.itemId, itemId), sql`${importMentions.importPersonId} is not null`));
    if (excerpts?.size) {
      for (const [proposalId, excerpt] of excerpts) {
        await tx
          .update(importMentions)
          .set({ excerpt })
          .where(and(eq(importMentions.itemId, itemId), eq(importMentions.importPersonId, proposalId)));
      }
    }
  }
}

export type FilingSummary = { primary: Record<string, number>; list: number; journal: number; dismissed: number; unclear: FilingInput[]; pending: number };

/** Applies the deterministic filing rules; unclear items are returned for a filing packet. */
export async function fileNotes(tx: Tx, ownerId: string, source: string, opts: { itemIds?: string[] } = {}): Promise<FilingSummary> {
  const inputs = (await loadFilingInputs(tx, ownerId, source)).filter((i) => !opts.itemIds || opts.itemIds.includes(i.itemId));
  const out: FilingSummary = { primary: {}, list: 0, journal: 0, dismissed: 0, unclear: [], pending: 0 };
  for (const input of inputs) {
    const d = decideFiling(input);
    if (d.mode === "pending") {
      out.pending++;
      continue;
    }
    if (d.mode === "unclear") {
      out.unclear.push(input);
      continue;
    }
    if (d.mode === "dismiss") {
      await tx.update(importItemsX).set({ status: "skipped", dismissedReason: `filing:${d.reason}` }).where(eq(importItemsX.id, input.itemId));
      out.dismissed++;
      continue;
    }
    await setRoles(tx, ownerId, input.itemId, d);
    if (d.mode === "primary" || d.mode === "primary-folder") out.primary[d.rule] = (out.primary[d.rule] ?? 0) + 1;
    else out[d.mode]++;
  }
  return out;
}

/** Applies a subagent's FilingFile for items the rules could not decide. */
export async function applyFilingFile(tx: Tx, ownerId: string, source: string, file: FilingFile) {
  const inputs = new Map((await loadFilingInputs(tx, ownerId, source)).map((i) => [i.itemId, i]));
  const props = await loadProposals(tx, ownerId, source);
  const byKey = new Map(props.map((p) => [p.key, p]));
  const res = { primary: 0, list: 0, journal: 0, dismissed: 0, skipped: [] as string[] };
  for (const f of file.filings) {
    const input = inputs.get(f.itemId);
    if (!input) {
      res.skipped.push(`${f.itemId}: not an extracted item`);
      continue;
    }
    if (f.mode === "dismiss") {
      await tx.update(importItemsX).set({ status: "skipped", dismissedReason: `filing:${f.dismissReason ?? "subagent"}` }).where(eq(importItemsX.id, f.itemId));
      res.dismissed++;
      continue;
    }
    if (f.mode === "primary") {
      const p = f.primaryPersonKey ? byKey.get(f.primaryPersonKey) : undefined;
      const m = p && input.mentions.find((x) => x.person?.proposalId === p.id);
      if (!p || !m) {
        res.skipped.push(`${f.itemId}: ${f.primaryPersonKey} is not a person in this note`);
        continue;
      }
      await setRoles(tx, ownerId, f.itemId, { mode: "primary", primaryMentionId: m.mentionId, person: m.person!, rule: "packet", reason: f.reason });
      res.primary++;
      continue;
    }
    const excerpts = new Map<string, string>();
    const item = await tx.select({ text: importItemsX.text }).from(importItemsX).where(eq(importItemsX.id, f.itemId));
    for (const e of f.excerpts) {
      const p = byKey.get(e.personKey);
      if (p && item[0]?.text.includes(e.excerpt)) excerpts.set(p.id, e.excerpt);
    }
    await setRoles(tx, ownerId, f.itemId, { mode: f.mode, reason: f.reason }, excerpts);
    res[f.mode]++;
  }
  return res;
}

/** Mentions referenced by a packet that already exist with a person (for --only-unassigned). */
export function assignedMentionIds(rows: Awaited<ReturnType<typeof loadMentionRows>>) {
  return new Set(rows.filter((r) => r.candidateIndex != null && (r.importPersonId || (r.reason ?? "").startsWith("dismissed"))).map((r) => `${r.itemId}:${r.candidateIndex}`));
}
