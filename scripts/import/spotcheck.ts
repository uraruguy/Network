/**
 * Human spot-check report (read-only).
 *   pnpm tsx scripts/import/spotcheck.ts --run <id> [--seed 1]
 * → .cache/import/<run>/spotcheck.md: 15 sampled people across buckets, EVERY first-name → full-name
 *   merge with its reasons, and every note the full-text screen rescued from the old 700-char skip.
 */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { bootstrap, resolveOwner, run } from "./_env";

run(async () => {
  const ctx = bootstrap();
  const owner = await resolveOwner(ctx);
  const { db } = await import("@/lib/db");
  const { sql } = await import("drizzle-orm");
  const { readProfile } = await import("@/lib/import/profile");
  const { isFullName, nameTokens } = await import("@/lib/import/names");
  const seed = ctx.args.opt("--seed", "1")!;
  const q = async <T>(s: ReturnType<typeof sql>) => (await db.execute(s)) as unknown as T[];

  type P = { id: string; key: string; display_name: string; aliases: string[]; disposition: string; status: string; decided_by: string | null; confidence: number | null; reasons: string | null; review_flags: string[]; match_person_id: string | null; profile: unknown; committed_person_id: string | null };
  const props = await q<P>(sql`select id, key, display_name, aliases, disposition, status::text, decided_by, confidence, reasons, review_flags, match_person_id, profile, committed_person_id from import_people where owner_id = ${owner.id} and source = ${ctx.source}`);
  type M = { import_person_id: string; surface: string; role: string; confidence: number | null; reason: string | null; snippet: string | null; title: string | null; folders: string[]; date: string };
  const ms = await q<M>(sql`
    select m.import_person_id, m.surface, m.role, m.confidence, m.reason, coalesce(m.excerpt, m.evidence) as snippet, i.title, i.folders, coalesce(i.external_created_at, i.created_at)::date::text as date
    from import_mentions m join import_items i on i.id = m.item_id
    where m.owner_id = ${owner.id} and i.source = ${ctx.source} and m.import_person_id is not null order by date`);
  const byPerson = new Map<string, M[]>();
  for (const m of ms) byPerson.set(m.import_person_id, [...(byPerson.get(m.import_person_id) ?? []), m]);
  const rank = (p: P) => createHash("sha1").update(`${seed}:${p.key}`).digest("hex");
  const pick = (xs: P[], n: number) => [...xs].sort((a, b) => rank(a).localeCompare(rank(b))).slice(0, n);
  const live = props.filter((p) => p.status !== "merged");

  const buckets: [string, P[]][] = [
    ["Auto-approved, full name", pick(live.filter((p) => p.decided_by === "auto" && ["approved", "committed"].includes(p.status) && isFullName(p.display_name)), 3)],
    ["Auto-approved, first name only", pick(live.filter((p) => p.decided_by === "auto" && ["approved", "committed"].includes(p.status) && !isFullName(p.display_name)), 3)],
    ["Matched to an existing person", pick(live.filter((p) => p.match_person_id), 2)],
    ["Decided by Jakob", pick(live.filter((p) => p.decided_by === "user"), 2)],
    ["In review", pick(live.filter((p) => p.status === "proposed"), 3)],
    ["Auto-rejected (passerby / not a person / self)", pick(live.filter((p) => p.status === "rejected"), 2)],
  ];
  const seen = new Set<string>();
  const person = (p: P) => {
    const prof = readProfile(p.profile);
    const m = byPerson.get(p.id) ?? [];
    const facts = [prof.role, prof.company, prof.city, prof.categories.join("/")].filter(Boolean).join(" · ");
    return [
      `### ${p.display_name} \`${p.key}\``,
      `${p.disposition} · **${p.status}**${p.decided_by ? ` (${p.decided_by})` : ""} · confidence ${p.confidence?.toFixed(2) ?? "?"}${p.review_flags.length ? ` · flags: ${p.review_flags.join(", ")}` : ""}${p.match_person_id ? ` · existing person ${p.match_person_id}` : ""}`,
      facts ? `- ${facts}` : null,
      p.aliases.length ? `- aliases: ${p.aliases.join(", ")}` : null,
      prof.keyFacts.length ? `- facts: ${prof.keyFacts.slice(0, 4).join(" · ")}` : null,
      p.reasons ? `- reasons: ${p.reasons}` : null,
      `- mentions (${m.length}):`,
      ...m.slice(0, 6).map((x) => `  - ${x.date} “${x.title ?? "(untitled)"}” [${x.folders.join(", ")}] as **${x.surface}** (${x.role}${x.confidence != null ? `, ${x.confidence.toFixed(2)}` : ""})${x.snippet ? `\n    > ${x.snippet.replace(/\s+/g, " ").slice(0, 240)}` : ""}`),
      "",
    ]
      .filter((l) => l !== null)
      .join("\n");
  };

  const out: string[] = [`# Spot-check — run ${ctx.runId}`, "", `Generated ${new Date().toISOString()} · ${props.length} proposals · seed ${seed}`, ""];
  out.push("## Sample (15 people across buckets)", "");
  for (const [title, ps] of buckets) {
    out.push(`#### ${title} (${ps.length})`, "");
    for (const p of ps) {
      seen.add(p.id);
      out.push(person(p));
    }
  }

  // Every first-name → full-name merge.
  out.push("## Every first-name → full-name merge", "");
  let merges = 0;
  for (const p of live.filter((p) => isFullName(p.display_name))) {
    const bare = (byPerson.get(p.id) ?? []).filter((m) => nameTokens(m.surface).length === 1);
    if (!bare.length) continue;
    merges++;
    out.push(`- **${p.display_name}** \`${p.key}\` (${p.status}${p.decided_by ? `, ${p.decided_by}` : ""}) ← ${bare.length} first-name mention(s)`);
    for (const m of bare) out.push(`  - “${m.surface}” in “${m.title ?? "(untitled)"}” ${m.date} [${m.folders.join(", ")}] — ${m.reason ?? "no reason given"} (${m.confidence?.toFixed(2) ?? "?"})`);
    if (p.reasons) out.push(`  - person reasons: ${p.reasons}`);
  }
  if (!merges) out.push("_none_");
  out.push("");

  // Rescued notes.
  const rescued = await q<{ id: string; title: string | null; folders: string[]; status: string; classification: string | null; reason: string | null }>(sql`
    select id, title, folders, status::text, classification, decision->'screen'->>'reason' as reason
    from import_items where owner_id = ${owner.id} and source = ${ctx.source} and (decision->'screen'->>'rescued')::boolean is true order by title`);
  out.push(`## Rescued notes (${rescued.length}) — skipped by the 700-char screen, kept by the full-text screen`, "");
  for (const r of rescued) out.push(`- “${r.title ?? "(untitled)"}” [${r.folders.join(", ")}] → ${r.classification} · now ${r.status}${r.reason ? ` — ${r.reason}` : ""}`);
  if (!rescued.length) out.push("_none_");

  const file = join(ctx.runDir, "spotcheck.md");
  writeFileSync(file, `${out.join("\n")}\n`);
  console.log(`sampled ${seen.size} people · ${merges} first-name→full-name merges · ${rescued.length} rescued notes`);
  console.log(`→ ${file}`);
});
