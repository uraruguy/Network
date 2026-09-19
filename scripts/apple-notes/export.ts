/**
 * Exports Apple Notes to .cache/notes-export.json for import into The Network.
 *
 *   pnpm notes:export              # all folders
 *   pnpm notes:export "Folder"     # one folder
 *
 * Run this in Terminal on the Mac that has Notes. macOS will ask once:
 * "Terminal wants access to control Notes" → Allow.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const folder = process.argv[2];
const script = join(process.cwd(), "scripts/apple-notes/export.js");
const outDir = join(process.cwd(), ".cache");
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, "notes-export.json");

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

type Row = { id: string; title: string; html: string | null; text: string | null; created: string | null; modified: string | null; folder: string; account: string; locked: boolean };
const summary = JSON.parse(raw) as { notes: number; locked: number; errors: string[] };
const rows = JSON.parse(readFileSync(outFile, "utf8")) as Row[];
if (summary.errors.length) console.error("Folders that failed:", summary.errors);

const locked = rows.filter((r) => r.locked).length;
const byFolder = rows.reduce<Record<string, number>>((acc, r) => ((acc[r.folder] = (acc[r.folder] ?? 0) + 1), acc), {});
console.log(`\n${rows.length} notes exported in ${((Date.now() - t0) / 1000).toFixed(1)}s${locked ? ` (${locked} locked, skipped content)` : ""}`);
for (const [f, n] of Object.entries(byFolder).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${f}`);
console.log(`\nSaved to ${outFile}\nNext: open The Network → Settings → Import from Apple Notes, and drop this file in.`);
