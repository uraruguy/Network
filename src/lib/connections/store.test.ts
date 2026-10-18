import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secrets";
import { openStoredSecret } from "./store";

const OLD = "old-app-secret-old-app-secret-old-app-secret!";
const NEW = "new-app-secret-new-app-secret-new-app-secret!";
const ctx = { ownerId: "114287d9-de5c-4ff5-a9b5-25d0785552e7", kind: "ai", provider: "anthropic" };

describe("openStoredSecret (APP_SECRET rotation)", () => {
  it("opens a current secret without rewriting it", () => {
    const env = { APP_SECRET: NEW, APP_SECRET_PREVIOUS: OLD };
    expect(openStoredSecret(encryptSecret("sk-ant-1", ctx, env), ctx, env)).toEqual({ secret: "sk-ant-1", error: null, reencrypted: null });
  });

  it("re-encrypts a secret only the previous key opens, so it survives dropping APP_SECRET_PREVIOUS", () => {
    const token = encryptSecret("sk-ant-2", ctx, { APP_SECRET: OLD });
    const opened = openStoredSecret(token, ctx, { APP_SECRET: NEW, APP_SECRET_PREVIOUS: OLD });
    expect(opened.secret).toBe("sk-ant-2");
    expect(opened.reencrypted).toBeTruthy();
    expect(decryptSecret(opened.reencrypted!, ctx, { APP_SECRET: NEW })).toBe("sk-ant-2");
    expect(() => decryptSecret(token, ctx, { APP_SECRET: NEW })).toThrow();
  });

  it("reports unreadable secrets without inventing a replacement", () => {
    const token = encryptSecret("sk-ant-3", ctx, { APP_SECRET: OLD });
    expect(openStoredSecret(token, ctx, { APP_SECRET: NEW })).toMatchObject({ secret: null, reencrypted: null, error: expect.stringMatching(/decrypt/i) });
    // Bound to its row: another provider's AAD never opens it.
    expect(openStoredSecret(token, { ...ctx, provider: "openrouter" }, { APP_SECRET: NEW, APP_SECRET_PREVIOUS: OLD }).secret).toBeNull();
  });
});
