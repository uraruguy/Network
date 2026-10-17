/**
 * Builds the resolution workspace for Claude subagents (read-only on the database).
 *   pnpm tsx scripts/import/prepare.ts --run <id> [--all] [--max-ambiguous 60] [--max-unique 40]
 * → .cache/import/<run>/
 *     notes/<itemId>.md     full note text with a header (evidence for the resolver)
 *     index.md              one line per cluster
 *     packets/rNN.json      ResolvePacket (mentions + anchors), ambiguous clusters whole
 *     BRIEF-resolve.md      instructions (from src/lib/ai/prompts/resolve.ts)
 *     resolutions/          where subagents write rNN.json
 * By default only mentions without an assignment are packed (incremental runs); --all repacks everything.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bootstrap, resolveOwner, run } from "./_env";

run(async () => {
  const ctx = bootstrap();
  const owner = await resolveOwner(ctx);
  const { db } = await import("@/lib/db");
  const { loadExtractedItems, loadMentionRows, loadAnchors, assignedMentionIds } = await import("@/lib/data/import-resolve");
  const { buildMentions, normalizeExtraction } = await import("@/lib/import/mentions");
  const { clusterNodes, packClusters } = await import("@/lib/import/cluster");
  const { buildResolveBrief } = await import("@/lib/ai/prompts/resolve");
  const { SCHEMA_VERSION } = await import("@/lib/import/contracts");
  const { noteDate, isoDay } = await import("@/lib/import/dates");
  const { normName } = await import("@/lib/import/names");

  const items = await loadExtractedItems(db, owner.id, ctx.source);
  const all = buildMentions(items);
  const assigned = ctx.args.flag("--all") ? new Set<string>() : assignedMentionIds(await loadMentionRows(db, owner.id, ctx.source));
  const mentions = all.filter((m) => !assigned.has(m.mentionId));
  const anchors = await loadAnchors(db, owner.id, ctx.source);
  console.log(`${items.length} extracted notes · ${all.length} mentions (${mentions.length} to resolve) · ${anchors.length} anchors`);
  if (!mentions.length) {
    console.log("nothing to resolve");
    return;
  }

  const byId = new Map(mentions.map((m) => [m.mentionId, m]));
  const anchorById = new Map(anchors.map((a) => [`a:${a.id}`, a]));
  const clusters = clusterNodes([
    ...mentions.map((m) => ({ id: m.mentionId, kind: "mention" as const, name: m.surface, aliases: m.aliases })),
    ...anchors.map((a) => ({ id: `a:${a.id}`, kind: "anchor" as const, name: a.displayName, aliases: a.aliases })),
  ]).filter((c) => c.mentionIds.length);

  const summarize = (ids: string[]) => {
    const groups = new Map<string, { n: number; folders: Set<string>; dates: string[] }>();
    for (const id of ids) {
      const m = byId.get(id)!;
      const g = groups.get(m.surface) ?? { n: 0, folders: new Set<string>(), dates: [] };
      g.n++;
      m.folders.forEach((f) => g.folders.add(f));
      if (m.date) g.dates.push(m.date);
      groups.set(m.surface, g);
    }
    return [...groups.entries()]
      .sort((a, b) => b[1].n - a[1].n)
      .map(([s, g]) => `${s} ×${g.n} (${[...g.folders].slice(0, 3).join(", ")}${g.dates.length ? `; ${g.dates.sort()[0]}..${g.dates.sort().at(-1)}` : ""})`)
      .join("; ");
  };
  const plans = packClusters(clusters, {
    maxAmbiguous: Number(ctx.args.opt("--max-ambiguous", "60")),
    maxUnique: Number(ctx.args.opt("--max-unique", "40")),
    surfaceOf: (id) => byId.get(id)!.surface,
    summarize,
  });

  // Fresh workspace (keeps resolutions/ and filing outputs from earlier passes).
  const dir = ctx.runDir;
  for (const sub of ["packets", "notes"]) {
    rmSync(join(dir, sub), { recursive: true, force: true });
    mkdirSync(join(dir, sub), { recursive: true });
  }
  mkdirSync(join(dir, "resolutions"), { recursive: true });

  const packetOf = new Map<string, string>();
  const neededItems = new Set<string>();
  for (const p of plans) {
    const ms = p.clusters.flatMap((c) => c.mentionIds.map((id) => byId.get(id)!));
    const anchorIds = [...new Set(p.clusters.flatMap((c) => c.anchorIds))];
    for (const c of p.clusters) packetOf.set(c.clusterId, p.packetId);
    ms.forEach((m) => neededItems.add(m.itemId));
    const packet = {
      packetId: p.packetId,
      schemaVersion: SCHEMA_VERSION,
      runId: ctx.runId,
      kind: p.kind,
      clusters: p.clusters.map((c) => ({ clusterId: c.clusterId, label: c.label, mentionIds: c.mentionIds, part: c.part, siblings: c.siblings })),
      mentions: ms,
      anchors: anchorIds.map((id) => anchorById.get(id)!).filter(Boolean),
    };
    writeFileSync(join(dir, "packets", `${p.packetId}.json`), JSON.stringify(packet, null, 1));
  }

  // Note files (evidence).
  const itemById = new Map(items.map((i) => [i.id, i]));
  for (const id of neededItems) {
    const it = itemById.get(id)!;
    const ex = normalizeExtraction(it.candidates, it.extractionVersion);
    const nd = noteDate({ title: it.title, occurredAt: ex.occurredAt, created: it.created });
    const header = [
      `# ${it.title ?? "(untitled)"}`,
      ``,
      `- itemId: ${it.id}`,
      `- folders: ${it.folders.join(", ") || "-"}`,
      `- date: ${isoDay(nd.date)} (${nd.source}) · created ${it.created ? isoDay(it.created) : "?"}`,
      `- classification: ${it.classification ?? "-"} · extraction v${ex.version}`,
      `- candidates: ${ex.candidates.map((c) => `[${c.index}] ${c.name}`).join(" · ") || "-"}`,
      ex.noteSummary ? `- summary: ${ex.noteSummary}` : null,
      ``,
      `---`,
      ``,
    ].filter((l) => l !== null);
    writeFileSync(join(dir, "notes", `${it.id}.md`), `${header.join("\n")}${it.text}\n`);
  }

  // index.md
  const lines = clusters.map((c) => {
    const surfaces = new Map<string, number>();
    for (const id of c.mentionIds) surfaces.set(byId.get(id)!.surface, (surfaces.get(byId.get(id)!.surface) ?? 0) + 1);
    const s = [...surfaces.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ×${v}`).join(", ");
    const anchorsTxt = c.anchorIds.map((id) => anchorById.get(id)).filter(Boolean).map((a) => `${a!.displayName}${a!.key ? ` [${a!.key}]` : ""}`).join(", ");
    return `- ${c.id} · **${c.label}** (${c.mentionIds.length}${c.ambiguous ? ", ambiguous" : ""}): ${s}${anchorsTxt ? ` · anchors: ${anchorsTxt}` : ""} · ${packetOf.get(c.id) ?? "-"}`;
  });
  writeFileSync(
    join(dir, "index.md"),
    `# Clusters — run ${ctx.runId}\n\n${mentions.length} mentions in ${clusters.length} clusters across ${plans.length} packets. Distinct names: ${new Set(mentions.map((m) => normName(m.surface))).size}.\n\n${lines.join("\n")}\n`,
  );

  // Brief
  const brief = buildResolveBrief({
    runId: ctx.runId,
    runDir: dir,
    packets: plans.map((p) => ({ packetId: p.packetId, kind: p.kind, mentions: p.clusters.reduce((s, c) => s + c.mentionIds.length, 0), clusters: p.clusters.map((c) => `${c.label}${c.part ? ` (part ${c.part})` : ""}`) })),
    validateCmd: `pnpm tsx scripts/import/validate.ts --run ${ctx.runId} --stage resolve`,
  });
  writeFileSync(join(dir, "BRIEF-resolve.md"), brief);
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({ runId: ctx.runId, createdAt: new Date().toISOString(), items: items.length, mentions: mentions.length, clusters: clusters.length, packets: plans.map((p) => p.packetId), existingResolutions: readdirSync(join(dir, "resolutions")) }, null, 2));
  const amb = plans.filter((p) => p.kind === "ambiguous").length;
  console.log(`${clusters.length} clusters (${clusters.filter((c) => c.ambiguous).length} ambiguous) → ${plans.length} packets (${amb} ambiguous, ${plans.length - amb} unique) · ${neededItems.size} note files`);
  console.log(`→ ${dir}/BRIEF-resolve.md`);
});
