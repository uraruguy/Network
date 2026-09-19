/** Sends the current digest preview to an address. Usage: pnpm tsx scripts/send-test-digest.ts you@example.com */
import { config } from "dotenv";
config({ path: [".env.local", ".env"] });

async function main() {
  const to = process.argv[2];
  if (!to) throw new Error("Usage: pnpm tsx scripts/send-test-digest.ts you@example.com");
  const { runDigest } = await import("../src/lib/data/digest");
  const { sendEmail } = await import("../src/lib/email/send");
  const [first] = await runDigest({ preview: true });
  if (!first?.html) throw new Error("No profile to preview");
  const id = await sendEmail({ to, subject: "The Network — test digest", html: first.html });
  console.log("sent", id, "→", to);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
