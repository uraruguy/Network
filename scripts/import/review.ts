/**
 * Terminal review queue (same data functions as the app's /api/import/proposals).
 *   pnpm tsx scripts/import/review.ts [--tab review|approved|rejected|committed|merged|all]
 *   pnpm tsx scripts/import/review.ts --approve key1,key2 [--write]
 *   pnpm tsx scripts/import/review.ts --reject key | --passerby key | --reopen key | --undo key [--write]
 *   pnpm tsx scripts/import/review.ts --merge key --into otherKey [--write]
 * Decisions are recorded as decided_by = 'user' (only run them on Jakob's instruction).
 */
import { bootstrap, die, resolveOwner, run } from "./_env";

run(async () => {
  const ctx = bootstrap({ writes: true });
  const owner = await resolveOwner(ctx);
  const { db } = await import("@/lib/db");
  const { and, eq } = await import("drizzle-orm");
  const { importPeople } = await import("@/lib/db/schema-import");
  const { decideProposal, listProposals, reviewStats, REVIEW_TABS } = await import("@/lib/data/import-review");
  const { inTransaction } = await import("@/lib/data/import-shared");

  const actions = (["approve", "reject", "passerby", "reopen", "undo", "merge"] as const).filter((a) => ctx.args.opt(`--${a}`));
  if (!actions.length) {
    const tab = (ctx.args.opt("--tab", "review") as (typeof REVIEW_TABS)[number]) ?? "review";
    if (!REVIEW_TABS.includes(tab)) die(`--tab must be one of ${REVIEW_TABS.join(", ")}`);
    console.log(JSON.stringify((await reviewStats(db, owner.id, ctx.source)).proposals));
    let cursor: string | null = null;
    do {
      const page: Awaited<ReturnType<typeof listProposals>> = await listProposals(db, owner.id, ctx.source, tab, cursor);
      for (const p of page.items) {
        console.log(`\n${p.displayName}  [${p.key}]  ${p.disposition} · ${p.status}${p.decidedBy ? ` (${p.decidedBy})` : ""} · ${p.confidence?.toFixed(2)} · ${p.mentionCount} mentions${p.reviewFlags.length ? ` · ${p.reviewFlags.join(", ")}` : ""}`);
        if (p.reasons) console.log(`  ${p.reasons}`);
        for (const e of p.evidence) console.log(`  · “${e.title}” as ${e.surface} (${e.role})${e.snippet ? ` — ${e.snippet.replace(/\s+/g, " ").slice(0, 140)}` : ""}`);
        if (p.similar.length) console.log(`  similar: ${p.similar.map((s) => `${s.displayName} (${s.kind})`).join(", ")}`);
      }
      cursor = page.nextCursor;
    } while (cursor);
    return;
  }

  const keyOf = async (k: string) => {
    const [p] = await db.select({ id: importPeople.id }).from(importPeople).where(and(eq(importPeople.ownerId, owner.id), eq(importPeople.source, ctx.source), eq(importPeople.key, k)));
    return p?.id ?? die(`no proposal with key ${k}`);
  };
  const results = await inTransaction(db, ctx.write, async (tx) => {
    const out: string[] = [];
    for (const a of actions) {
      for (const key of ctx.args.opts(`--${a}`)) {
        const id = await keyOf(key);
        const input = a === "merge" ? { action: "merge" as const, intoId: await keyOf(ctx.args.opt("--into") ?? die("--merge needs --into <key>")) } : { action: a };
        const after = await decideProposal(owner.id, id, input, tx);
        out.push(`${a} ${key} → ${after.status}${after.mergedIntoId ? ` (merged)` : ""}`);
      }
    }
    return out;
  });
  console.log(results.join("\n"));
  console.log(ctx.write ? "saved" : "dry run — rolled back (pass --write)");
});
