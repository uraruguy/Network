import { vi } from "vitest";

// Dummy env so modules that validate env at import time can load in tests.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3100";
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
process.env.APP_SECRET ??= "test-app-secret-test-app-secret-test-app-secret";
process.env.CRON_SECRET ??= "test-cron-secret";

// `server-only` throws outside the bundler's react-server condition; tests are server code.
vi.mock("server-only", () => ({}));
