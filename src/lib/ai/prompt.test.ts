import { describe, expect, it } from "vitest";
import { aiConfigFromEnv } from "./config";
import { buildSystem, contextBlock, MAX_INDEX_PEOPLE, peopleIndex, RULES, tailBlock } from "./prompt";

const person = (i: number, over: Partial<{ name: string; city: string | null; categories: string[]; tags: string[] }> = {}) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  name: over.name ?? `Person ${i}`,
  city: over.city ?? null,
  categories: over.categories ?? [],
  tags: over.tags ?? [],
});

describe("prompt", () => {
  it("keeps the rules free of personal data", () => {
    expect(RULES).not.toMatch(/Jakob|Ljubljana|Berlin/);
  });

  it("renders one index line per person, sorted by name, without separators leaking", () => {
    const lines = peopleIndex([person(2, { name: "Žan | Kos", city: "Ljubljana/SI", categories: ["Friend"], tags: ["climber", "ski"] }), person(1, { name: "Ana" })]).split("\n");
    expect(lines[0]).toBe("00000000-0000-4000-8000-000000000001|Ana|||");
    expect(lines[1]).toBe("00000000-0000-4000-8000-000000000002|Žan Kos|Ljubljana/SI|Friend|climber,ski");
  });

  it("caps the index and says how many were left out", () => {
    const many = Array.from({ length: MAX_INDEX_PEOPLE + 5 }, (_, i) => person(i));
    const block = contextBlock({ categories: [], activities: [], tags: [], people: many });
    expect(block).toMatch(/5 less recent people omitted/);
    expect(block.split("\n").filter((l) => l.startsWith("00000000-")).length).toBe(MAX_INDEX_PEOPLE);
  });

  it("puts profile values in the dynamic tail", () => {
    const tail = tailBlock({ ownerName: "Mia", timezone: "Europe/Berlin", homeCity: "Berlin, Germany", focus: { id: "p1", name: "Ana" }, now: new Date("2026-10-17T10:00:00Z") });
    expect(tail).toMatch(/Saturday, 17 October 2026/);
    expect(tail).toMatch(/Mia/);
    expect(tail).toMatch(/Berlin, Germany/);
    expect(tail).toMatch(/page of Ana \(id p1\)/);
  });

  it("sets cache breakpoints on rules and context only", () => {
    const sys = buildSystem({ ownerName: null, timezone: "UTC", homeCity: null, categories: [], activities: [], tags: [], people: [] });
    expect(sys).toHaveLength(3);
    expect(sys[0]!.providerOptions).toMatchObject({ anthropic: { cacheControl: { type: "ephemeral" } }, openrouter: { cacheControl: { type: "ephemeral" } } });
    expect(sys[1]!.providerOptions).toBeDefined();
    expect(sys[2]!.providerOptions).toBeUndefined();
  });
});

describe("aiConfigFromEnv", () => {
  it("prefers Anthropic direct when its key is set", () => {
    expect(aiConfigFromEnv({ ANTHROPIC_API_KEY: "a", OPENROUTER_API_KEY: "o" })).toMatchObject({ provider: "anthropic", apiKey: "a", mainModel: "claude-sonnet-5-5", fastModel: "claude-haiku-5-5", source: "env" });
  });

  it("falls back to OpenRouter, honours AI_PROVIDER and chat model overrides", () => {
    expect(aiConfigFromEnv({ OPENROUTER_API_KEY: "o" })).toMatchObject({ provider: "openrouter", mainModel: "anthropic/claude-sonnet-5.5", fastModel: "anthropic/claude-haiku-5.5" });
    expect(aiConfigFromEnv({ AI_PROVIDER: "openrouter", ANTHROPIC_API_KEY: "a", OPENROUTER_API_KEY: "o", AI_CHAT_MODEL: "x/y" })).toMatchObject({ provider: "openrouter", apiKey: "o", mainModel: "x/y" });
    expect(aiConfigFromEnv({ AI_PROVIDER: "agent-sdk" })).toMatchObject({ provider: "agent-sdk", mainModel: "sonnet" });
  });

  it("is off without credentials", () => {
    expect(aiConfigFromEnv({}).provider).toBe("off");
    expect(aiConfigFromEnv({ AI_PROVIDER: "anthropic" }).provider).toBe("off");
  });
});
