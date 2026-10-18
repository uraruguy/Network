/**
 * Smoke test for the import AI path with a SYNTHETIC note (no real data, no DB).
 *   pnpm tsx scripts/import/smoke.ts [--provider agent-sdk]
 */
import { parseArgs } from "./_env";
import { prepareAi } from "./_ai";
import { config } from "dotenv";

async function main() {
  config({ path: ".env.local", quiet: true });
  const args = parseArgs();
  prepareAi(args);
  const { screenBatch, extractNoteV2 } = await import("@/lib/ai/import");
  const note = {
    id: "00000000-0000-4000-8000-000000000001",
    title: "Kava z Ano Testno",
    folders: ["Meeting Notes"],
    text: "Danes na kavi z Ano Testno (Testera d.o.o., CTO) v Ljubljani. Rekla je, da išče angel investitorje. Spoznala sva se na Podim 2025. Rada hodi v hribe. Moram ji poslat deck do 1.12.2026. Omenila je še Marka, ki dela pri Bolt.",
    created: "2026-10-01T10:00:00.000Z",
  };
  let t0 = Date.now();
  const screen = await screenBatch([note]);
  console.log("screen:", JSON.stringify(screen), `${Date.now() - t0}ms`);
  t0 = Date.now();
  const ex = await extractNoteV2({ ...note, existingNames: [], mode: "full" });
  console.log("extract:", JSON.stringify(ex, null, 1).slice(0, 2500), `${Date.now() - t0}ms`);
}
main().then(
  () => process.exit(0),
  (e) => {
    console.error("FAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
