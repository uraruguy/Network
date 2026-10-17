import { describe, expect, it } from "vitest";
import { deaccent, genderHint, isFullName, lemmaCandidates, nameVariants, nicknameCanon, normName, personKey } from "./names";

describe("deaccent", () => {
  it("folds Slovenian and other diacritics", () => {
    expect(deaccent("Blaž Čuk Šuštar")).toBe("Blaz Cuk Sustar");
    expect(deaccent("Đurđa")).toBe("Djurdja");
    expect(deaccent("Höflinger Sommarøy")).toBe("Hoflinger Sommaroy");
    expect(deaccent("Ćiro")).toBe("Ciro");
  });
});

describe("lemmaCandidates", () => {
  const has = (s: string, base: string) => expect(lemmaCandidates(s)).toContain(base);
  it("keeps the surface first", () => expect(lemmaCandidates("Blažem")[0]).toBe("Blažem"));
  it("masculine consonant stems", () => {
    has("Blažem", "Blaž");
    has("Blaža", "Blaž");
    has("Blažu", "Blaž");
    has("Petrom", "Petr");
  });
  it("i/j stems", () => {
    has("Janija", "Jani");
    has("Janiju", "Jani");
    has("Janijem", "Jani");
  });
  it("a-stems (feminine and masculine -a)", () => {
    has("Kajo", "Kaja");
    has("Kaje", "Kaja");
    has("Miho", "Miha");
    has("Mihi", "Miha");
  });
  it("Jani is ambiguous between Jani and Jana", () => {
    const l = lemmaCandidates("Jani");
    expect(l).toContain("Jani");
    expect(l).toContain("Jana");
  });
  it("o-names and -e names with -t-", () => {
    has("Marka", "Marko");
    has("Markom", "Marko");
    has("Toneta", "Tone");
  });
  it("possessives", () => {
    has("Blaževa", "Blaž");
    has("Kajina", "Kaja");
  });
  it("multi-word surfaces", () => expect(lemmaCandidates("Blažem Novakom")).toContain("Blaž Novak"));
});

describe("names helpers", () => {
  it("normName / personKey", () => {
    expect(normName("  Blaž   Novák ")).toBe("blaz novak");
    expect(personKey("Blaž Novak")).toBe("blaz-novak");
    expect(personKey("Blaž", "Goolets")).toBe("blaz-goolets");
    expect(personKey("Dr. Ana-Marija Kos")).toBe("ana-marija-kos");
  });
  it("isFullName", () => {
    expect(isFullName("Blaž Novak")).toBe(true);
    expect(isFullName("Blaž")).toBe(false);
    expect(isFullName("Arijita A.")).toBe(false);
    expect(isFullName("Arijita A. Sethi")).toBe(true);
  });
  it("nickname groups", () => {
    expect(nicknameCanon("Aleks")).toBe("alex");
    expect(nicknameCanon("Aleksander")).toBe("alex");
    expect(nicknameCanon("Janez")).toBe("jani");
    expect(nicknameCanon("Matjo")).toBe("matjaz");
    expect(nicknameCanon("Zoran")).toBe("zoran");
    expect(nameVariants("Matjaž")).toContain("matjo");
  });
});

describe("genderHint", () => {
  const at = (text: string, name: string) => genderHint(text, text.indexOf(name));
  it("reads participles", () => {
    expect(at("Kaja je rekla, da pride.", "Kaja")).toBe("f");
    expect(at("Blaž je rekou da bo šou.", "Blaž")).toBe("m");
    expect(at("Jani je bil tam.", "Jani")).toBe("m");
    expect(at("Jani je bila tam.", "Jani")).toBe("f");
  });
  it("returns null without a signal", () => {
    expect(at("Srečal Petra na kavi.", "Petra")).toBeNull();
  });
  it("stops at the sentence end", () => {
    expect(at("Videl sem Miho. Ana je rekla nekaj.", "Miho")).toBeNull();
  });
});
