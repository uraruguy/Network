import { describe, expect, it } from "vitest";
import { legacyHobbies } from "@/lib/queries/compat";
import { cleanNames, fold, nameKey, slugify } from "./text";

describe("text helpers", () => {
  it("fold strips accents and lower-cases", () => {
    expect(fold("Čevapi ŽIGA Ångström")).toBe("cevapi ziga angstrom");
  });

  it("nameKey ignores emoji, case and accents, but keeps emoji-only names distinct", () => {
    expect(nameKey("🥾 Hiking")).toBe(nameKey("Hiking"));
    expect(nameKey("☕️  Coffee ")).toBe("coffee");
    expect(nameKey("Tek na smučeh 🎿")).toBe("tek na smuceh");
    expect(nameKey("🏄")).not.toBe(nameKey("🎿"));
    expect(nameKey("🏄")).not.toBe("");
  });

  it("slugify matches the SQL private.slugify()", () => {
    expect(slugify("Cross-country skiing")).toBe("cross-country-skiing");
    expect(slugify("  Čaj s prijatelji — Ž! ")).toBe("caj-s-prijatelji-z");
    expect(slugify("Board games")).toBe("board-games");
    expect(slugify("🎾")).toBe("");
  });

  it("cleanNames trims, collapses and de-duplicates case-insensitively", () => {
    expect(cleanNames(["  Climbing  crew ", "climbing crew", "", "LJ", "lj"])).toEqual(["Climbing crew", "LJ"]);
  });
});

describe("legacyHobbies (v1 compat)", () => {
  const acts = [
    { id: "1", slug: "padel", name: "Padel" },
    { id: "2", slug: "sailing", name: "Sailing" },
    { id: "3", slug: "board-games", name: "Board games" },
  ];
  it("maps known slugs and folds the rest into other", () => {
    expect(legacyHobbies(["1", "2", "3"], acts)).toEqual({ hobbies: ["padel", "other"], hobbiesOther: "Sailing, Board games" });
    expect(legacyHobbies(["1"], acts)).toEqual({ hobbies: ["padel"], hobbiesOther: null });
    expect(legacyHobbies(undefined, acts)).toEqual({ hobbies: [], hobbiesOther: null });
  });
});
