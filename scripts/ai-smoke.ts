/** Smoke test for the configured AI provider: one structured call + one tool call. */
import { config } from "dotenv";
config({ path: [".env.local", ".env"] });
import { generateText, Output } from "ai";
import { z } from "zod";

async function main() {
  const { aiModel, aiProvider, toolsAreProviderExecuted } = await import("../src/lib/ai/provider");
  console.log("provider:", aiProvider());
  const t0 = Date.now();
  const { output } = await generateText({
    model: await aiModel({ tier: "fast" }),
    output: Output.object({ schema: z.object({ name: z.string(), city: z.string().nullable(), hobbies: z.array(z.string()) }) }),
    prompt: "Extract: 'Met Maria Silva from Lisbon at Web Summit, she runs, loves padel.'",
  });
  console.log("structured:", JSON.stringify(output), `${Date.now() - t0}ms`);

  const { tool } = await import("ai");
  const tools = {
    lookup_person: tool({
      description: "Look up a person by name",
      inputSchema: z.object({ name: z.string() }),
      execute: async ({ name }) => ({ name, city: "Ljubljana", note: "test fixture" }),
    }),
  };
  const t1 = Date.now();
  const { stepCountIs } = await import("ai");
  const r = await generateText({
    model: await aiModel({ tier: "fast", tools }),
    ...(toolsAreProviderExecuted() ? {} : { tools, stopWhen: stepCountIs(4) }),
    prompt: "Where does David Rekar live? Use the lookup tool, then answer in one short sentence.",
  });
  console.log("tool answer:", r.text.trim(), `${Date.now() - t1}ms`);
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
