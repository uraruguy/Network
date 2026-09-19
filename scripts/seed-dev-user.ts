/** Creates the local-dev owner account in the Supabase running via `supabase start`. Never run against production. */
import { config } from "dotenv";
config({ path: [".env.local", ".env"] });
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
if (!/127\.0\.0\.1|localhost/.test(url)) throw new Error("Refusing to seed a non-local Supabase");
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const email = process.env.DEV_EMAIL ?? "dev@local.test";
const password = process.env.DEV_PASSWORD ?? "network-dev-2026";

async function main() {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: "Jakob (dev)" } });
  if (error && !/already/.test(error.message)) throw error;
  console.log(`Dev user ready: ${email} / ${password}`, data.user?.id ?? "(existing)");
}
main();
