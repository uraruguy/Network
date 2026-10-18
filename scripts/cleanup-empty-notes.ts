/**
 * One-off cleanup: soft-deletes notes that have neither a title nor any text (left behind by
 * "New note" taps that were never typed into, and by the v1 bug where a partial note update —
 * e.g. pinning — blanked the content). Soft delete only: restore with POST /api/notes/<id>/restore.
 *
 *   pnpm tsx scripts/cleanup-empty-notes.ts            # dry run against the local database
 *   pnpm tsx scripts/cleanup-empty-notes.ts --apply    # actually soft-delete (local)
 *   … --yes-prod --apply                               # required for any non-local DATABASE_URL
 */
import "./lib/server-only";
import { config } from "dotenv";
config({ path: [".env.local", ".env"] });

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const url = process.env.DATABASE_URL ?? "";
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })();
  const local = ["127.0.0.1", "localhost", "::1"].includes(host);
  if (!local && !argv.includes("--yes-prod")) {
    throw new Error(`Refusing to touch a non-local database (${host || "unknown host"}). Pass --yes-prod if you really mean it.`);
  }

  const { db } = await import("../src/lib/db");
  const { deleteEmptyNotes } = await import("../src/lib/data/notes");
  const owners = await db.query.profiles.findMany({ columns: { id: true, email: true } });
  for (const o of owners) {
    const n = await deleteEmptyNotes(o.id, { dryRun: !apply });
    console.log(`${o.email}: ${n} empty note(s) ${apply ? "soft-deleted" : "would be soft-deleted (dry run; pass --apply)"}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
