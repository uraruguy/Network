/**
 * Exports Apple Notes to .cache/notes-export.json for import into The Network.
 *
 *   pnpm notes:export                  # all folders
 *   pnpm notes:export "Folder"         # one folder
 *   pnpm notes:export --clean          # …then run the cleaner → .cache/notes-export.clean.json
 *
 * Run this in Terminal on the Mac that has Notes. macOS will ask once:
 * "Terminal wants access to control Notes" → Allow.
 *
 * The raw export embeds images and can exceed V8's maximum string length (≈512 MB), so this script
 * never reads it back: counts come from the JXA summary on stdout, and cleaning runs in Python.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const clean = args.includes("--clean");
const folder = args.find((a) => !a.startsWith("--"));
const script = join(process.cwd(), "scripts/apple-notes/export.js");
const cleaner = join(process.cwd(), "scripts/apple-notes/clean.py");
const outDir = join(process.cwd(), ".cache");
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, "notes-export.json");
const cleanFile = join(outDir, "notes-export.clean.json");

console.log(folder ? `Exporting folder "${folder}"…` : "Exporting all notes… (Notes.app will open)");
const t0 = Date.now();
let raw: string;
try {
  raw = execFileSync("osascript", ["-l", "JavaScript", script, outFile, ...(folder ? [folder] : [])], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "inherit"],
  });
} catch (e) {
  const err = e as { stderr?: string; message: string };
  if (/-1743|Not authori[sz]ed/.test(err.stderr ?? err.message)) {
    console.error("\nmacOS blocked access to Notes. Open System Settings → Privacy & Security → Automation → Terminal and enable Notes, then run again.");
  } else {
    console.error(err.stderr ?? err.message);
  }
  process.exit(1);
}

const summary = JSON.parse(raw) as { notes: number; locked: number; byFolder?: Record<string, number>; errors: string[] };
if (summary.errors.length) console.error("Folders that failed:", summary.errors);
const mb = (statSync(outFile).size / 1024 / 1024).toFixed(0);
console.log(`\n${summary.notes} notes exported in ${((Date.now() - t0) / 1000).toFixed(1)}s (${mb} MB)${summary.locked ? ` · ${summary.locked} locked, content skipped` : ""}`);
for (const [f, n] of Object.entries(summary.byFolder ?? {}).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${f}`);
console.log(`\nSaved to ${outFile}`);

if (clean) {
  console.log("\nCleaning (strips embedded images, collapses duplicate ids into folders[])…");
  try {
    execFileSync("python3", [cleaner, outFile, cleanFile], { stdio: "inherit" });
  } catch {
    console.error(`Cleaner failed — run it yourself: python3 scripts/apple-notes/clean.py ${outFile} ${cleanFile}`);
    process.exit(1);
  }
  console.log(`\nNext: pnpm tsx scripts/import/diff.ts ${cleanFile} --prev <previous clean export>`);
} else {
  console.log(`Next: pnpm notes:clean ${outFile} ${cleanFile}  (or rerun with --clean)`);
}
