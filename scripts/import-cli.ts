/**
 * Headless Apple Notes import (classify + extract), no browser needed.
 *   pnpm tsx scripts/import-cli.ts .cache/notes-export.json [--label "Apple Notes"] [--owner email]
 * Review/approve afterwards in the app (Settings → Import), or pass --auto to commit all high-confidence items.
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"] });
import { readFileSync } from "node:fs";

async function main() {
  const [file, ...rest] = process.argv.slice(2);
  if (!file) throw new Error("Usage: pnpm tsx scripts/import-cli.ts <export.json> [--label L] [--owner email] [--auto]");
  const arg = (k: string) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : undefined; };
  const auto = rest.includes("--auto");

  const { db, schema } = await import("../src/lib/db");
  const { createImportJob, classifyNext, extractNext, bulkCommitHighConfidence, getJob } = await import("../src/lib/data/import");
  const { aiProvider } = await import("../src/lib/ai/provider");
  const { eq } = await import("drizzle-orm");

  const ownerEmail = arg("--owner");
  const profile = ownerEmail ? await db.query.profiles.findFirst({ where: eq(schema.profiles.email, ownerEmail) }) : await db.query.profiles.findFirst();
  if (!profile) throw new Error("No profile found — sign up in the app first");
  console.log(`owner: ${profile.email} · provider: ${aiProvider()}`);

  const rows = JSON.parse(readFileSync(file, "utf8"));
  const job = await createImportJob(profile.id, rows, arg("--label"));
  console.log(`job ${job.id}: ${job.totalItems} new/changed notes (of ${rows.length})`);

  let t0 = Date.now();
  for (;;) {
    const r = await classifyNext(profile.id, job.id, 20);
    process.stdout.write(`\rclassified +${r.processed}, ${r.remaining} left   `);
    if (!r.processed || !r.remaining) break;
  }
  console.log(`\nclassification done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  t0 = Date.now();
  for (;;) {
    const r = await extractNext(profile.id, job.id, 4);
    process.stdout.write(`\rextracted +${r.processed}, ${r.remaining} left   `);
    if (!r.processed || !r.remaining) break;
  }
  console.log(`\nextraction done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

  const full = await getJob(profile.id, job.id);
  const counts: Record<string, number> = {};
  for (const it of full!.items) counts[it.status] = (counts[it.status] ?? 0) + 1;
  console.log("status:", counts);
  for (const it of full!.items) {
    const ex = it.candidates as { candidates?: { name: string; matchName: string | null; city: string | null; categories: string[]; confidence: number; followUps: { what: string }[] }[]; noteSummary?: string } | null;
    console.log(`\n· ${it.title}  [${it.classification ?? "-"} ${it.classificationConfidence != null ? Math.round(it.classificationConfidence * 100) + "%" : ""}] → ${it.status}${it.error ? " ERROR " + it.error : ""}`);
    for (const c of ex?.candidates ?? []) console.log(`    - ${c.name}${c.matchName ? ` (= ${c.matchName})` : ""} · ${c.city ?? "?"} · [${c.categories.join(", ")}] · ${Math.round(c.confidence * 100)}%${c.followUps.length ? ` · ↻ ${c.followUps.map((f) => f.what).join("; ")}` : ""}`);
  }
  if (auto) console.log(`\nauto-committed ${await bulkCommitHighConfidence(profile.id, job.id)} items`);
  console.log(`\nReview in the app: /import/${job.id}`);
  process.exit(0);
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
