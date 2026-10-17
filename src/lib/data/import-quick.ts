/**
 * Quick import ("paste a note"): AI extraction of one pasted note → per-person decisions → saved
 * through the same commit path as the Apple Notes pipeline, as a one-note job with source "paste".
 * Every write is in the commit log, so the save can be undone like any import commit.
 */
import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db as defaultDb, schema } from "@/lib/db";
import { importItemsX, importMentions, importPeople } from "@/lib/db/schema-import";
import { extractNoteV2 } from "@/lib/ai/import";
import { aiProvider } from "@/lib/ai/provider";
import { QUICK_FAST_CHARS, QUICK_SOURCE, defaultPrimaryIndex, defaultQuickAction, type QuickAction, type QuickExtractInput, type QuickSaveInput } from "@/app/api/import/quick/schema";
import type { CandidateV2, ExtractionV2 } from "@/lib/import/contracts";
import { isoDay } from "@/lib/import/dates";
import { contentHash } from "@/lib/import/diff";
import { nameTokens, normName, personKey } from "@/lib/import/names";
import { readProfile } from "@/lib/import/profile";
import { commitImport } from "./import-commit";
import { ImportError, type DbOrTx } from "./import-shared";
import { existingPeopleNames } from "./import-stage";

const { people, importJobs } = schema;

type Owner = { id: string; displayName: string };

async function loadPerson(db: DbOrTx, ownerId: string, id: string): Promise<Owner> {
  const [p] = await db
    .select({ id: people.id, displayName: people.displayName })
    .from(people)
    .where(and(eq(people.ownerId, ownerId), eq(people.id, id), isNull(people.deletedAt)));
  if (!p) throw new ImportError(404, "That person no longer exists");
  return p;
}

/* ------------------------------------------------------------------ */
/*  Match suggestions                                                  */
/* ------------------------------------------------------------------ */

export type QuickSuggestion = { id: string; displayName: string; detail: string | null; exact: boolean; score: number };

/** Existing people that could be this candidate: same name, trigram-similar, or same first name for first-name-only mentions. */
async function matchSuggestions(db: DbOrTx, ownerId: string, c: Pick<CandidateV2, "name" | "aliases">): Promise<QuickSuggestion[]> {
  const toks = nameTokens(c.name);
  const firstOnly = toks.length === 1 ? c.name.trim() : null;
  const rows = (await db.execute(sql`
    select p.id, p.display_name, p.headline, p.company, l.name as city, similarity(p.display_name, ${c.name}) as score
    from people p left join locations l on l.id = p.home_location_id
    where p.owner_id = ${ownerId} and p.deleted_at is null
      and (lower(unaccent(p.display_name)) = lower(unaccent(${c.name}))
           or similarity(p.display_name, ${c.name}) > 0.4
           ${firstOnly ? sql`or lower(unaccent(split_part(p.display_name, ' ', 1))) = lower(unaccent(${firstOnly}))` : sql``})
    order by score desc, p.display_name
    limit 4`)) as unknown as { id: string; display_name: string; headline: string | null; company: string | null; city: string | null; score: number }[];
  const names = new Set([c.name, ...c.aliases].map(normName).filter(Boolean));
  return rows
    .map((r) => ({
      id: r.id,
      displayName: r.display_name,
      detail: [r.headline, r.company, r.city].filter(Boolean).join(" · ") || null,
      exact: names.has(normName(r.display_name)),
      score: Number(r.score) || 0,
    }))
    .sort((a, b) => Number(b.exact) - Number(a.exact) || b.score - a.score)
    .slice(0, 3);
}

/** Does this candidate name the person the sheet was opened from? ("Blaž" in a note on Blaž Novak's page.) */
function namesOwner(c: Pick<CandidateV2, "name" | "aliases">, owner: Owner) {
  const own = nameTokens(owner.displayName);
  return [c.name, ...c.aliases].some((n) => {
    const t = nameTokens(n);
    if (!t.length) return false;
    if (t.join(" ") === own.join(" ")) return true;
    return t.length === 1 && t[0] === own[0];
  });
}

/* ------------------------------------------------------------------ */
/*  Extract                                                            */
/* ------------------------------------------------------------------ */

export type QuickPerson = {
  index: number;
  name: string;
  aliases: string[];
  role: string | null;
  company: string | null;
  city: string | null;
  categories: CandidateV2["categories"];
  activities: string[];
  keyFacts: string[];
  followUp: string | null;
  salience: number;
  confidence: number;
  suggestions: QuickSuggestion[];
  action: QuickAction;
  matchPersonId: string | null;
  isOwner: boolean;
};

export type QuickExtractResult = {
  extraction: ExtractionV2;
  title: string;
  owner: Owner | null;
  people: QuickPerson[];
  primaryIndex: number | null;
  model: "fast" | "main";
};

export async function quickExtract(ownerId: string, input: QuickExtractInput, db: DbOrTx = defaultDb): Promise<QuickExtractResult> {
  const owner = input.personId ? await loadPerson(db, ownerId, input.personId) : null;
  const tier = input.text.length < QUICK_FAST_CHARS ? "fast" : "main";
  const extraction = await extractNoteV2({
    title: null,
    text: input.text,
    created: isoDay(new Date()),
    folders: [],
    existingNames: await existingPeopleNames(db, ownerId),
    mode: "full",
    tier,
    compact: aiProvider() !== "agent-sdk",
  });

  // The candidate that is the page's person (most salient if several).
  const ownerIndex = owner
    ? extraction.candidates.reduce<number | null>((best, c, i) => (namesOwner(c, owner) && (best === null || c.salience > extraction.candidates[best]!.salience) ? i : best), null)
    : null;

  const out: QuickPerson[] = [];
  for (const [index, c] of extraction.candidates.entries()) {
    const isOwner = index === ownerIndex;
    let suggestions = await matchSuggestions(db, ownerId, c);
    if (isOwner && owner) suggestions = [{ id: owner.id, displayName: owner.displayName, detail: null, exact: true, score: 1 }, ...suggestions.filter((s) => s.id !== owner.id)].slice(0, 3);
    const best = suggestions[0];
    const action = isOwner ? "merge" : defaultQuickAction(c, best);
    const f = c.followUps[0];
    out.push({
      index,
      name: c.name,
      aliases: c.aliases,
      role: c.role,
      company: c.company,
      city: c.city,
      categories: c.categories,
      activities: c.activities,
      keyFacts: c.keyFacts.slice(0, 3),
      followUp: f ? [f.what, f.explicitDate ?? f.when].filter(Boolean).join(" · ") : null,
      salience: c.salience,
      confidence: c.confidence,
      suggestions,
      action,
      matchPersonId: action === "merge" ? (best?.id ?? null) : null,
      isOwner,
    });
  }
  const kept = out.filter((p) => p.action !== "skip").map((p) => p.index);
  return {
    extraction,
    title: extraction.suggestedTitle?.trim() || firstLine(input.text),
    owner,
    people: out,
    primaryIndex: owner ? null : defaultPrimaryIndex(extraction.candidates, kept),
    model: tier,
  };
}

/* ------------------------------------------------------------------ */
/*  Save                                                               */
/* ------------------------------------------------------------------ */

const firstLine = (text: string) => (text.split("\n").find((l) => l.trim())?.trim() ?? "Pasted note").slice(0, 120);
const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const toHtml = (text: string) =>
  text
    .split("\n")
    .map((l) => (l.trim() ? `<div>${escapeHtml(l)}</div>` : "<div><br></div>"))
    .join("");
const cut = (s: string | null | undefined, n: number) => (s ? s.trim().slice(0, n) || null : null);

/** Profile proposal for a candidate (same shape the resolver writes), sanitised to the contract. */
export function candidateProfile(c: CandidateV2, itemId: string, today: string, categories?: CandidateV2["categories"]) {
  return readProfile({
    role: cut(c.role, 200),
    company: cut(c.company, 200),
    city: cut(c.city, 120),
    country: cut(c.country, 120),
    metContext: cut(c.metContext, 600),
    metDate: c.metDate && /^\d{4}(-\d{2}(-\d{2})?)?$/.test(c.metDate) ? c.metDate : null,
    metCity: cut(c.metCity, 120),
    warmth: c.warmth,
    circle: c.circle,
    categories: categories ?? c.categories,
    activities: c.activities.map((a) => a.trim().slice(0, 60)).filter(Boolean),
    tags: [],
    keyFacts: c.keyFacts.map((k) => k.trim().slice(0, 400)).filter(Boolean).slice(0, 8),
    howICanHelp: cut(c.howICanHelp, 600),
    whatICanAsk: cut(c.whatICanAsk, 600),
    links: c.links.map((l) => l.trim().slice(0, 400)).filter(Boolean),
    introducedByKey: null,
    followUps: c.followUps.map((f) => ({ what: f.what.trim().slice(0, 400), when: cut(f.explicitDate ?? f.when, 120), sourceItemId: itemId })).filter((f) => f.what),
    firstSeen: today,
    lastSeen: today,
  });
}

function splitName(displayName: string) {
  const toks = displayName.trim().split(/\s+/);
  return { firstName: toks[0] ?? null, lastName: toks.length > 1 ? toks.slice(1).join(" ") : null };
}

export type QuickSaveResult = {
  commitId: string;
  noteId: string | null;
  personId: string | null;
  personName: string | null;
  created: number;
  updated: number;
  reminders: number;
};

export async function quickSave(ownerId: string, input: QuickSaveInput, db: DbOrTx = defaultDb): Promise<QuickSaveResult> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const today = isoDay(now);
    const stamp = randomUUID();
    const short = stamp.slice(0, 8);
    const owner = input.personId ? await loadPerson(tx, ownerId, input.personId) : null;
    const kept = input.people.filter((p) => p.action !== "skip");

    const mergeIds = [...new Set(kept.map((p) => p.matchPersonId).filter((x): x is string => !!x))];
    if (mergeIds.length) {
      const found = await tx
        .select({ id: people.id })
        .from(people)
        .where(and(eq(people.ownerId, ownerId), inArray(people.id, mergeIds), isNull(people.deletedAt)));
      if (found.length !== mergeIds.length) throw new ImportError(422, "Someone you merged into no longer exists");
    }

    const title = input.title?.trim() || input.extraction.suggestedTitle?.trim() || firstLine(input.text);
    const [job] = await tx.insert(importJobs).values({ ownerId, source: QUICK_SOURCE, label: `Pasted note · ${today}`, totalItems: 1 }).returning({ id: importJobs.id });
    const [item] = await tx
      .insert(importItemsX)
      .values({
        ownerId,
        jobId: job!.id,
        source: QUICK_SOURCE,
        externalId: `${QUICK_SOURCE}:${stamp}`,
        title,
        html: toHtml(input.text),
        text: input.text,
        folder: null,
        folders: [],
        externalCreatedAt: now,
        externalModifiedAt: now,
        contentHash: contentHash(input.text),
        classification: "person",
        classificationConfidence: 1,
        candidates: input.extraction,
        extractionVersion: input.extraction.version,
        status: "extracted",
        screenedWith: QUICK_SOURCE,
      })
      .returning({ id: importItemsX.id });
    const itemId = item!.id;

    // One approved proposal per kept candidate (decided by Jakob in the sheet).
    const keys: string[] = [];
    const proposalOf = new Map<number, string>();
    let ownerProposal: string | null = null;
    for (const d of kept) {
      const c = input.extraction.candidates[d.index]!;
      const matchPersonId = d.action === "merge" ? (d.matchPersonId ?? null) : null;
      const key = `${personKey(d.displayName).slice(0, 70)}-${short}`;
      const aliases = [...new Set([c.name, ...c.aliases, ...c.surfaces].map((a) => a.trim()).filter((a) => a && a !== d.displayName))].slice(0, 20);
      const [row] = await tx
        .insert(importPeople)
        .values({
          ownerId,
          source: QUICK_SOURCE,
          key,
          displayName: d.displayName,
          aliases,
          disposition: "person",
          profile: { ...candidateProfile(c, itemId, today, d.categories), ...splitName(d.displayName) },
          confidence: c.confidence,
          reasons: "Pasted note",
          reviewFlags: [],
          needsReview: false,
          status: "approved",
          decidedBy: "user",
          decidedAt: now,
          matchPersonId,
          createReminder: d.createReminder,
          engine: QUICK_SOURCE,
        })
        .returning({ id: importPeople.id });
      keys.push(key);
      proposalOf.set(d.index, row!.id);
      if (owner && matchPersonId === owner.id) ownerProposal = row!.id;
    }
    // Opened from a person's page but the note never names them: file it under them anyway.
    let ownerMentionless = false;
    if (owner && !ownerProposal) {
      const key = `${personKey(owner.displayName).slice(0, 64)}-page-${short}`;
      const [row] = await tx
        .insert(importPeople)
        .values({
          ownerId,
          source: QUICK_SOURCE,
          key,
          displayName: owner.displayName,
          aliases: [],
          disposition: "person",
          profile: { ...readProfile({}), ...splitName(owner.displayName) },
          confidence: 1,
          reasons: "Opened from their page",
          needsReview: false,
          status: "approved",
          decidedBy: "user",
          decidedAt: now,
          matchPersonId: owner.id,
          createReminder: false,
          engine: QUICK_SOURCE,
        })
        .returning({ id: importPeople.id });
      keys.push(key);
      ownerProposal = row!.id;
      ownerMentionless = true;
    }

    const primaryIndex = input.primaryIndex ?? defaultPrimaryIndex(input.extraction.candidates, kept.map((p) => p.index));
    const primary = ownerProposal ?? (primaryIndex != null ? (proposalOf.get(primaryIndex) ?? null) : null);
    if (!primary) throw new ImportError(422, "Keep at least one person to file the note under");

    for (const [index, c] of input.extraction.candidates.entries()) {
      const pid = proposalOf.get(index) ?? null;
      await tx.insert(importMentions).values({
        ownerId,
        itemId,
        candidateIndex: index,
        surface: c.name,
        importPersonId: pid,
        role: pid && pid === primary ? "primary" : "mention",
        confidence: c.confidence,
        reason: pid ? "quick import" : "dismissed: skipped in quick import",
        excerpt: c.excerpt && input.text.includes(c.excerpt) ? c.excerpt : null,
      });
    }
    if (ownerMentionless) {
      await tx.insert(importMentions).values({ ownerId, itemId, candidateIndex: null, surface: owner!.displayName, importPersonId: ownerProposal, role: "primary", confidence: 1, reason: "quick import from their page" });
    }

    const report = await commitImport(tx, ownerId, { source: QUICK_SOURCE, dryRun: false, keys, itemIds: [itemId], now, commitId: stamp });
    const failed = [...report.people.failed.map((f) => `${f.key}: ${f.error}`), ...report.notes.failed.map((f) => f.error)];
    if (failed.length) throw new ImportError(500, `Could not save the note (${failed[0]})`);
    const [after] = await tx.select({ noteId: importItemsX.noteId }).from(importItemsX).where(eq(importItemsX.id, itemId));
    const primaryResult = report.people.results.find((r) => r.proposalId === primary);
    const [primaryPerson] = primaryResult
      ? await tx.select({ displayName: people.displayName }).from(people).where(eq(people.id, primaryResult.personId))
      : [];
    return {
      commitId: report.commitId,
      noteId: after?.noteId ?? null,
      personId: primaryResult?.personId ?? null,
      personName: primaryPerson?.displayName ?? null,
      created: report.people.created,
      updated: report.people.updated + report.people.unchanged,
      reminders: report.reminders,
    };
  });
}
