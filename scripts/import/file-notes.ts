/**
 * Decides which person each extracted note is filed under (deterministic rules), and writes
 * filing packets for the notes the rules cannot decide. Dry run unless --write.
 *   pnpm tsx scripts/import/file-notes.ts --run <id> [--write]
 * → roles in import_mentions (primary / listed / excerpt), dismissed notes (no people),
 *   .cache/import/<run>/filing/fNN.json + BRIEF-filing.md for subagents → apply.ts --stage filing.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bootstrap, resolveOwner, run } from "./_env";

run(async () => {
  const ctx = bootstrap({ writes: true });
  const owner = await resolveOwner(ctx);
  const { db } = await import("@/lib/db");
  const { inTransaction } = await import("@/lib/data/import-shared");
  const { fileNotes, loadExtractedItems } = await import("@/lib/data/import-resolve");
  const { buildFilingBrief } = await import("@/lib/ai/prompts/filing");
  const { SCHEMA_VERSION } = await import("@/lib/import/contracts");
  const { noteFileName } = await import("@/lib/import/mentions");

  const summary = await inTransaction(db, ctx.write, (tx) => fileNotes(tx, owner.id, ctx.source));
  console.log(`primary by rule: ${JSON.stringify(summary.primary)}`);
  console.log(`list ${summary.list} · journal ${summary.journal} · dismissed (no people) ${summary.dismissed} · waiting for resolution ${summary.pending} · unclear ${summary.unclear.length}`);

  const dir = join(ctx.runDir, "filing");
  rmSync(dir, { recursive: true, force: true });
  if (summary.unclear.length) {
    mkdirSync(dir, { recursive: true });
    mkdirSync(join(ctx.runDir, "filing-out"), { recursive: true });
    mkdirSync(join(ctx.runDir, "notes"), { recursive: true });
    const items = new Map((await loadExtractedItems(db, owner.id, ctx.source)).map((i) => [i.id, i]));
    const size = 25;
    const packets: { packetId: string; items: number }[] = [];
    for (let i = 0; i < summary.unclear.length; i += size) {
      const chunk = summary.unclear.slice(i, i + size);
      const packetId = `f${String(packets.length + 1).padStart(2, "0")}`;
      const packet = {
        packetId,
        schemaVersion: SCHEMA_VERSION,
        runId: ctx.runId,
        items: chunk.map((u) => {
          const people = new Map<string, { personKey: string; displayName: string; surfaces: string[]; salience: number | null; status: string }>();
          for (const m of u.mentions) {
            if (!m.person || m.person.disposition !== "person" || m.person.status === "rejected") continue;
            const e = people.get(m.person.key) ?? { personKey: m.person.key, displayName: m.person.displayName, surfaces: [], salience: m.salience, status: m.person.status };
            e.surfaces.push(m.surface);
            e.salience = Math.max(e.salience ?? 0, m.salience ?? 0) || e.salience;
            people.set(m.person.key, e);
          }
          return { itemId: u.itemId, title: u.title, folders: u.folders, classification: u.classification, noteFile: noteFileName(u.itemId), why: "several people, no title/folder/salience signal", people: [...people.values()] };
        }),
      };
      writeFileSync(join(dir, `${packetId}.json`), JSON.stringify(packet, null, 1));
      for (const u of chunk) {
        const nf = join(ctx.runDir, noteFileName(u.itemId));
        const it = items.get(u.itemId);
        if (it && !existsSync(nf)) writeFileSync(nf, `# ${it.title ?? "(untitled)"}\n\n- itemId: ${it.id}\n- folders: ${it.folders.join(", ")}\n\n---\n\n${it.text}\n`);
      }
      packets.push({ packetId, items: chunk.length });
    }
    writeFileSync(
      join(ctx.runDir, "BRIEF-filing.md"),
      buildFilingBrief({ runId: ctx.runId, runDir: ctx.runDir, packets, validateCmd: `pnpm tsx scripts/import/validate.ts --run ${ctx.runId} --stage filing` }),
    );
    console.log(`→ ${packets.length} filing packets in ${dir} (brief: BRIEF-filing.md)`);
  }
  console.log(ctx.write ? "filed" : "dry run — rolled back (pass --write to apply)");
});
