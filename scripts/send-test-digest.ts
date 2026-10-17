/**
 * Sends today's digest preview to an address through the configured transport (env or
 * Settings → Connections: Resend or SMTP). Doesn't mark anything as sent.
 *
 *   pnpm tsx scripts/send-test-digest.ts you@example.com
 */
import "./lib/server-only";
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const to = process.argv[2];
  if (!to) throw new Error("Usage: pnpm tsx scripts/send-test-digest.ts you@example.com");
  const { db } = await import("../src/lib/db");
  const { renderDigestPreview } = await import("../src/lib/data/digest");
  const { getEmailTransport } = await import("../src/lib/email");
  const owner = await db.query.profiles.findFirst();
  if (!owner) throw new Error("No profile to preview");
  const content = await renderDigestPreview(owner.id);
  if (!content) throw new Error("No profile to preview");
  const transport = await getEmailTransport(owner.id);
  if (!transport) throw new Error("E-mail is not configured (Settings → Connections, or RESEND_API_KEY / SMTP_URL)");
  const { id } = await transport.send({ to, subject: `The Network — test digest · ${content.subject}`, html: content.html, text: content.text });
  console.log(`sent via ${transport.provider}`, id ?? "", "→", to);
  process.exit(0);
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
