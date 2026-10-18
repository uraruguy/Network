import { describe, expect, it } from "vitest";
import type { AiConfig } from "./config";
import { aiModel, aiProvider, toolsAreProviderExecuted, withImportAi } from "./provider";

const saved: AiConfig = { provider: "anthropic", apiKey: "sk-ant-test", mainModel: "claude-sonnet-5-5", fastModel: "claude-haiku-5-5", source: "db" };

describe("withImportAi", () => {
  it("uses the owner's saved connection for import calls", async () => {
    await withImportAi(saved, async () => {
      expect(aiProvider()).toBe("anthropic");
      expect(toolsAreProviderExecuted()).toBe(false);
      expect((await aiModel({ tier: "fast" })) as unknown).toMatchObject({ modelId: "claude-haiku-5-5" });
      expect((await aiModel()) as unknown).toMatchObject({ modelId: "claude-sonnet-5-5" });
    });
  });

  it("treats a connection that is off as not configured", async () => {
    await withImportAi({ ...saved, provider: "off", apiKey: undefined }, async () => {
      expect(aiProvider()).toBeNull();
      await expect(aiModel()).rejects.toThrow(/Settings/);
    });
  });

  it("is scoped to its own call chain", async () => {
    const seen: (string | null)[] = [];
    await Promise.all([
      withImportAi(saved, async () => {
        await new Promise((r) => setTimeout(r, 5));
        seen.push(aiProvider());
      }),
      withImportAi({ ...saved, provider: "openrouter", apiKey: "sk-or-test" }, async () => {
        seen.push(aiProvider());
      }),
    ]);
    expect(seen.sort()).toEqual(["anthropic", "openrouter"]);
  });
});
