import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    // Node by default; DOM tests opt in with `// @vitest-environment happy-dom`.
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts", "test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
    // The opt-in local-database suites (TEST_DATABASE_URL) run several real commits per test and
    // can exceed the 5s default on a busy machine; unit runs keep the strict default.
    testTimeout: process.env.TEST_DATABASE_URL ? 30_000 : 5_000,
  },
});
