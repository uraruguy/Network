import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { classifyBatch, extractNote } from "@/lib/ai/import";
import type { Candidate, Extraction } from "@/lib/ai/import-schemas";
import { htmlToMarkdown } from "@/lib/html-to-md";
import { createPerson, updatePerson } from "./people";
import { createNote } from "./notes";
import { createReminder } from "./reminders";
import { searchCities } from "./locations";

const { importJobs, importItems, people, categories } = schema;

/* ------------------------------------------------------------------ */
/*  Ingest                                                             */
/* ------------------------------------------------------------------ */

export const exportRow = z.object({
  id: z.string(),
  title: z.string().nullable(),
  html: z.string().nullable(),
  text: z.string().nullable(),
  created: z.string().nullable(),
  modified: z.string().nullable(),
  folder: z.string().nullable(),
  account: z.string().nullable().optional(),
  locked: z.boolean().optional(),
});
export type ExportRow = z.infer<typeof exportRow>;

const hash = (s: string) => createHash("sha1").update(s).digest("hex");

export async function createImportJob(ownerId: string, rows: ExportRow[], label?: string) {
  const [job] = await db.insert(importJobs).values({ ownerId, label: label ?? `Apple Notes · ${new Date().toLocaleDateString("en-GB")}`, totalItems: 0 }).returning();
  const existing = await db.query.importItems.findMany({
    where: eq(importItems.ownerId, ownerId),
    columns: { externalId: true, contentHash: true, status: true },
  });
  const seen = new Map(existing.map((e) => [e.externalId, e]));

  let added = 0;
  for (const r of rows) {
    if (r.locked || (!r.text && !r.html)) continue;
    const text = (r.text ?? "").trim();
    const h = hash(text);
    const prev = seen.get(r.id);
    // Already handled and unchanged → skip silently.
    if (prev && prev.contentHash === h && (prev.status === "committed" || prev.status === "skipped")) continue;
    await db
      .insert(importItems)
      .values({
        ownerId,
        jobId: job!.id,
        externalId: r.id,
        title: r.title,
        html: r.html,
        text,
        folder: r.folder,
        externalCreatedAt: r.created ? new Date(r.created) : null,
        externalModifiedAt: r.modified ? new Date(r.modified) : null,
        contentHash: h,
        status: "pending",
      })
      .onConflictDoUpdate({
        target: [importItems.ownerId, importItems.externalId],
        set: { jobId: job!.id, title: r.title, html: r.html, text, folder: r.folder, externalModifiedAt: r.modified ? new Date(r.modified) : null, contentHash: h, status: "pending", classification: null, candidates: null, decision: null, error: null },
        // Only re-stage a note whose content actually changed; in-progress work on unchanged notes is kept.
        setWhere: sql`${importItems.contentHash} is distinct from excluded.content_hash`,
      });
    if (!prev || prev.contentHash !== h) added++;
  }
  await db.update(importJobs).set({ totalItems: added }).where(eq(importJobs.id, job!.id));
  return { ...job!, totalItems: added };
}

export async function listJobs(ownerId: string) {
  const jobs = await db.query.importJobs.findMany({ where: eq(importJobs.ownerId, ownerId), orderBy: [desc(importJobs.createdAt)] });
  const counts = await db
    .select({ jobId: importItems.jobId, status: importItems.status, n: sql<number>`count(*)::int` })
    .from(importItems)
    .where(eq(importItems.ownerId, ownerId))
    .groupBy(importItems.jobId, importItems.status);
  return jobs.map((j) => ({ ...j, counts: Object.fromEntries(counts.filter((c) => c.jobId === j.id).map((c) => [c.status, c.n])) as Record<string, number> }));
}

export async function getJob(ownerId: string, jobId: string) {
  const job = await db.query.importJobs.findFirst({ where: and(eq(importJobs.ownerId, ownerId), eq(importJobs.id, jobId)) });
  if (!job) return null;
  const items = await db.query.importItems.findMany({ where: eq(importItems.jobId, jobId), orderBy: [desc(importItems.externalModifiedAt)] });
  return { ...job, items };
}

export async function deleteJob(ownerId: string, jobId: string) {
  await db.delete(importJobs).where(and(eq(importJobs.ownerId, ownerId), eq(importJobs.id, jobId)));
}

/* ------------------------------------------------------------------ */
/*  AI passes                                                          */
/* ------------------------------------------------------------------ */

export async function classifyNext(ownerId: string, jobId: string | null, batch = 20) {
  const items = await db.query.importItems.findMany({
    where: and(eq(importItems.ownerId, ownerId), jobId ? eq(importItems.jobId, jobId) : undefined, eq(importItems.status, "pending")),
    orderBy: [asc(importItems.createdAt)],
    limit: batch,
    columns: { id: true, title: true, text: true, folder: true },
  });
  if (!items.length) return { processed: 0, remaining: 0 };
  try {
    const results = await classifyBatch(items);
    const byId = new Map(results.map((r) => [r.id, r]));
    for (const it of items) {
      const r = byId.get(it.id);
      await db
        .update(importItems)
        .set(
          r
            ? { classification: r.kind, classificationConfidence: r.confidence, candidates: { peopleHint: r.peopleHint }, status: r.kind === "not_people" ? "skipped" : "classified" }
            : { classification: "not_people", classificationConfidence: 0, status: "skipped" },
        )
        .where(eq(importItems.id, it.id));
    }
  } catch (e) {
    for (const it of items) await db.update(importItems).set({ status: "failed", error: (e as Error).message }).where(eq(importItems.id, it.id));
  }
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(importItems).where(and(eq(importItems.ownerId, ownerId), jobId ? eq(importItems.jobId, jobId) : undefined, eq(importItems.status, "pending")));
  return { processed: items.length, remaining: n ?? 0 };
}

export type StoredCandidate = Candidate & { matchPersonId: string | null; matchName: string | null };
export type StoredExtraction = Omit<Extraction, "candidates"> & { candidates: StoredCandidate[]; peopleHint?: string[] };

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

/** Best existing person for a candidate name: exact normalised match, then first-name+last-initial, then first-name-only if unique. */
function matchPerson(name: string, existing: { id: string; displayName: string }[]) {
  const n = norm(name);
  if (!n) return null;
  const exact = existing.find((p) => norm(p.displayName) === n);
  if (exact) return exact;
  const [first, ...rest] = n.split(" ");
  const last = rest.at(-1);
  const partial = existing.filter((p) => {
    const pn = norm(p.displayName).split(" ");
    return pn[0] === first && (!last || !pn.at(-1) || pn.at(-1)!.startsWith(last[0]!));
  });
  if (partial.length === 1) return partial[0]!;
  return null;
}

export async function extractNext(ownerId: string, jobId: string | null, concurrency = 3) {
  const items = await db.query.importItems.findMany({
    where: and(eq(importItems.ownerId, ownerId), jobId ? eq(importItems.jobId, jobId) : undefined, eq(importItems.status, "classified")),
    orderBy: [asc(importItems.createdAt)],
    limit: concurrency,
  });
  if (!items.length) return { processed: 0, remaining: 0 };
  const existing = await db.query.people.findMany({ where: and(eq(people.ownerId, ownerId), isNull(people.deletedAt)), columns: { id: true, displayName: true } });

  await Promise.all(
    items.map(async (it) => {
      try {
        const ex = await extractNote({
          title: it.title,
          text: it.text,
          html: it.html,
          created: it.externalCreatedAt?.toISOString() ?? null,
          folder: it.folder,
          existingNames: existing.map((p) => p.displayName),
        });
        const stored: StoredExtraction = {
          ...ex,
          peopleHint: (it.candidates as { peopleHint?: string[] } | null)?.peopleHint,
          candidates: ex.candidates.map((c) => {
            const m = matchPerson(c.name, existing);
            return { ...c, matchPersonId: m?.id ?? null, matchName: m?.displayName ?? null };
          }),
        };
        await db.update(importItems).set({ candidates: stored, status: "extracted", error: null }).where(eq(importItems.id, it.id));
      } catch (e) {
        await db.update(importItems).set({ status: "failed", error: (e as Error).message }).where(eq(importItems.id, it.id));
      }
    }),
  );
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(importItems).where(and(eq(importItems.ownerId, ownerId), jobId ? eq(importItems.jobId, jobId) : undefined, eq(importItems.status, "classified")));
  return { processed: items.length, remaining: n ?? 0 };
}

/** Failed items go back to the last completed stage: classified ones only redo extraction. */
export async function retryFailed(ownerId: string, jobId: string | null) {
  const scope = and(eq(importItems.ownerId, ownerId), jobId ? eq(importItems.jobId, jobId) : undefined, eq(importItems.status, "failed"));
  await db.update(importItems).set({ status: "classified", error: null }).where(and(scope, sql`${importItems.classification} is not null and ${importItems.classification} <> 'not_people'`));
  await db.update(importItems).set({ status: "pending", error: null }).where(scope);
}

/* ------------------------------------------------------------------ */
/*  Commit                                                             */
/* ------------------------------------------------------------------ */

export const decisionSchema = z.object({
  candidates: z.array(
    z.object({
      index: z.number().int(),
      action: z.enum(["create", "merge", "skip"]),
      personId: z.string().uuid().nullish(),
      name: z.string().min(1).optional(),
      city: z.string().nullish(),
      categories: z.array(z.string()).optional(),
    }),
  ),
  /** Which candidate index the note is filed under (others become mentions). null → no note. */
  primaryIndex: z.number().int().nullable(),
  createReminders: z.boolean().default(true),
  noteKind: z.enum(["note", "meeting", "call", "message"]).default("note"),
});
export type Decision = z.infer<typeof decisionSchema>;

async function geocode(city: string | null | undefined, country?: string | null) {
  if (!city) return null;
  const hits = await searchCities(city, 5);
  if (!hits.length) return null;
  const pick = (country && hits.find((h) => norm(h.country) === norm(country))) || hits[0]!;
  return { cityId: pick.id, name: pick.name, admin: pick.admin, country: pick.country, countryCode: pick.countryCode, lat: pick.lat, lng: pick.lng, timezone: pick.timezone };
}

function parseWhen(when: string | null, base: Date): Date | null {
  if (!when) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(when)) return new Date(when + "T09:00:00");
  const m = when.match(/(\d+)\s*(day|week|month|year|dan|dni|teden|tedn|mesec|mesc|let)/i);
  if (m) {
    const n = Number(m[1]);
    const u = m[2]!.toLowerCase();
    const d = new Date(base);
    if (u.startsWith("day") || u.startsWith("dan") || u.startsWith("dni")) d.setDate(d.getDate() + n);
    else if (u.startsWith("week") || u.startsWith("ted")) d.setDate(d.getDate() + 7 * n);
    else if (u.startsWith("month") || u.startsWith("mes")) d.setMonth(d.getMonth() + n);
    else d.setFullYear(d.getFullYear() + n);
    return d;
  }
  return null;
}

export async function commitItem(ownerId: string, itemId: string, decision: Decision) {
  const it = await db.query.importItems.findFirst({ where: and(eq(importItems.ownerId, ownerId), eq(importItems.id, itemId)) });
  if (!it || !it.candidates) throw new Error("Item not ready");
  const ex = it.candidates as StoredExtraction;
  const cats = await db.query.categories.findMany({ where: eq(categories.ownerId, ownerId) });
  const catId = (slug: string) => cats.find((c) => c.slug === slug || c.name.toLowerCase() === slug)?.id;

  const resolved = new Map<number, string>(); // candidate index → person id
  const source = { kind: "apple-notes", ref: it.externalId };

  // 1. People (create / merge)
  for (const d of decision.candidates) {
    const c = ex.candidates[d.index];
    if (!c || d.action === "skip") continue;
    const home = await geocode(d.city ?? c.city, c.country);
    const categoryIds = (d.categories ?? c.categories).map((s) => catId(s)).filter((x): x is string => !!x);
    if (d.action === "merge" && d.personId) {
      const existing = await db.query.people.findFirst({ where: and(eq(people.ownerId, ownerId), eq(people.id, d.personId)), with: { categories: true } });
      if (!existing) continue;
      const mergedCats = Array.from(new Set([...existing.categories.map((pc) => pc.categoryId), ...categoryIds]));
      await updatePerson(ownerId, d.personId, {
        headline: existing.headline ?? c.role ?? undefined,
        company: existing.company ?? c.company ?? undefined,
        homeLocation: existing.homeLocationId ? undefined : home,
        metContext: existing.metContext ?? c.metContext ?? undefined,
        metAt: existing.metAt ?? c.metDate ?? undefined,
        circle: existing.circle ?? c.circle ?? undefined,
        hobbies: Array.from(new Set([...existing.hobbies, ...c.hobbies])) as never,
        howICanHelp: existing.howICanHelp ?? c.howICanHelp ?? undefined,
        whatICanAsk: existing.whatICanAsk ?? c.whatICanAsk ?? undefined,
        categoryIds: mergedCats,
      });
      resolved.set(d.index, d.personId);
    } else {
      const met = await geocode(c.metCity, null);
      const created = await createPerson(
        ownerId,
        {
          displayName: d.name ?? c.name,
          headline: c.role,
          company: c.company,
          homeLocation: home,
          metContext: c.metContext,
          metAt: c.metDate && /^\d{4}-\d{2}-\d{2}$/.test(c.metDate) ? c.metDate : null,
          metLocation: met,
          warmth: c.warmth ?? "active",
          circle: c.circle,
          hobbies: c.hobbies,
          hobbiesOther: null,
          categoryIds,
          howICanHelp: c.howICanHelp,
          whatICanAsk: c.whatICanAsk,
          languages: [],
          interests: [],
          linkedin: c.links.find((l) => /linkedin/i.test(l)) ?? null,
          xHandle: c.links.find((l) => /x\.com|twitter/i.test(l)) ?? null,
          website: c.links.find((l) => /^https?:/.test(l) && !/linkedin|x\.com|twitter|instagram/i.test(l)) ?? null,
          instagram: c.links.find((l) => /instagram/i.test(l)) ?? null,
          introducedById: null,
          email: null, phone: null, birthday: null, firstName: null, lastName: null, followupCadenceDays: null, nextFollowupAt: null,
        },
        source,
      );
      resolved.set(d.index, created.id);
    }
  }

  // 2. Introductions between candidates of the same note
  for (const [idx, pid] of resolved) {
    const c = ex.candidates[idx]!;
    if (!c.introducedBy) continue;
    const introIdx = ex.candidates.findIndex((o) => norm(o.name) === norm(c.introducedBy!));
    const introId = introIdx >= 0 ? resolved.get(introIdx) : (await db.query.people.findFirst({ where: and(eq(people.ownerId, ownerId), sql`lower(${people.displayName}) = ${c.introducedBy.toLowerCase()}`) }))?.id;
    if (introId && introId !== pid) await db.update(people).set({ introducedById: introId }).where(eq(people.id, pid));
  }

  // 3. The note itself — verbatim, filed under the primary person, others mentioned
  let noteId: string | null = null;
  const primaryId = decision.primaryIndex != null ? resolved.get(decision.primaryIndex) : undefined;
  if (primaryId) {
    const md = it.html ? htmlToMarkdown(it.html) : it.text;
    const occurred = (ex.occurredAt && /^\d{4}-\d{2}-\d{2}$/.test(ex.occurredAt) ? new Date(ex.occurredAt + "T12:00:00") : null) ?? it.externalCreatedAt ?? new Date();
    const note = await createNote(
      ownerId,
      {
        personId: primaryId,
        title: it.title ?? ex.suggestedTitle,
        contentJson: null,
        contentMd: md,
        contentText: it.text,
        kind: decision.noteKind,
        occurredAt: occurred.toISOString(),
        pinned: false,
        mentionIds: [...resolved.values()].filter((id) => id !== primaryId),
      },
      source,
    );
    noteId = note.id;
  }

  // 4. Follow-ups → reminders
  if (decision.createReminders) {
    for (const [idx, pid] of resolved) {
      const c = ex.candidates[idx]!;
      for (const f of c.followUps) {
        const due = parseWhen(f.when, it.externalCreatedAt ?? new Date());
        const dueAt = due && due.getTime() > Date.now() ? due : new Date(Date.now() + 7 * 86_400_000);
        await createReminder(ownerId, { personId: pid, dueAt: dueAt.toISOString(), message: f.what, recurrence: "none", recurrenceDays: null });
      }
    }
  }

  await db.update(importItems).set({ status: "committed", decision: { ...decision, resolved: Object.fromEntries(resolved), noteId } }).where(eq(importItems.id, itemId));
  return { people: [...resolved.values()], noteId };
}

export async function skipItem(ownerId: string, itemId: string) {
  await db.update(importItems).set({ status: "skipped" }).where(and(eq(importItems.ownerId, ownerId), eq(importItems.id, itemId)));
}

export async function reopenItem(ownerId: string, itemId: string) {
  await db.update(importItems).set({ status: "pending", classification: null, candidates: null }).where(and(eq(importItems.ownerId, ownerId), eq(importItems.id, itemId)));
}

export async function bulkCommitHighConfidence(ownerId: string, jobId: string, min = 0.85) {
  const items = await db.query.importItems.findMany({ where: and(eq(importItems.ownerId, ownerId), eq(importItems.jobId, jobId), eq(importItems.status, "extracted")) });
  let n = 0;
  for (const it of items) {
    const ex = it.candidates as StoredExtraction;
    if (!ex.candidates.length || ex.candidates.some((c) => c.confidence < min)) continue;
    await commitItem(ownerId, it.id, {
      candidates: ex.candidates.map((c, i) => ({ index: i, action: c.matchPersonId ? "merge" : "create", personId: c.matchPersonId })),
      primaryIndex: 0,
      createReminders: true,
      noteKind: it.classification === "meeting" ? "meeting" : "note",
    });
    n++;
  }
  return n;
}

export { inArray };
