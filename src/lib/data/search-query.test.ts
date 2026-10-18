import { describe, expect, it } from "vitest";
import { likePattern, toTsQuery, words } from "./search-query";

describe("toTsQuery", () => {
  it("prefix-matches every word, AND-joined", () => {
    expect(toTsQuery("ana")).toBe("'ana':*");
    expect(toTsQuery("Ana  Ljubljana")).toBe("'ana':* & 'ljubljana':*");
  });

  it("keeps accented letters for the database to unaccent", () => {
    expect(toTsQuery("Čevapi Žiga")).toBe("'čevapi':* & 'žiga':*");
  });

  it("supports quoted phrases", () => {
    expect(toTsQuery('"board games" ljubljana')).toBe("('board' <-> 'games') & 'ljubljana':*");
    expect(toTsQuery('"climbing"')).toBe("'climbing'");
  });

  it("supports exclusions only next to a positive term", () => {
    expect(toTsQuery("climbing -gym")).toBe("'climbing':* & !'gym':*");
    expect(toTsQuery("-gym")).toBeNull();
    expect(toTsQuery('climbing -"board games"')).toBe("'climbing':* & !('board' <-> 'games')");
  });

  it("supports OR", () => {
    expect(toTsQuery("startup OR founder")).toBe("('startup':* | 'founder':*)");
    expect(toTsQuery("ana startup OR founder")).toBe("'ana':* & ('startup':* | 'founder':*)");
    expect(toTsQuery("OR ana")).toBe("'ana':*");
    expect(toTsQuery("ana OR")).toBe("'ana':*");
    expect(toTsQuery("ana or bob")).toBe("'ana':* & 'or':* & 'bob':*");
  });

  it("neutralises tsquery syntax and quotes", () => {
    expect(toTsQuery("a & b | !c")).toBe("'a':* & 'b':* & 'c':*");
    expect(toTsQuery("o'brien")).toBe("'o':* & 'brien':*");
    expect(toTsQuery("x:* <-> (y)")).toBe("'x':* & 'y':*");
    expect(toTsQuery("'; drop table people; --")).toBe("'drop':* & 'table':* & 'people':*");
    expect(toTsQuery("back\\slash")).toBe("'back':* & 'slash':*");
  });

  it("splits punctuation-joined words", () => {
    expect(toTsQuery("ana.kovac@gmail.com")).toBe("'ana':* & 'kovac':* & 'gmail':* & 'com':*");
    expect(toTsQuery("e-mail")).toBe("'e':* & 'mail':*");
  });

  it("returns null for nothing searchable", () => {
    expect(toTsQuery("")).toBeNull();
    expect(toTsQuery(null)).toBeNull();
    expect(toTsQuery("   ")).toBeNull();
    expect(toTsQuery("&|!():*")).toBeNull();
  });

  it("caps the number and length of terms", () => {
    const q = toTsQuery(Array.from({ length: 30 }, (_, i) => `w${i}`).join(" "))!;
    expect(q.split(" & ")).toHaveLength(12);
    expect(words("a".repeat(200))[0]).toHaveLength(64);
  });
});

describe("likePattern", () => {
  it("wraps and escapes LIKE wildcards", () => {
    expect(likePattern(" ana ")).toBe("%ana%");
    expect(likePattern("50%_off\\")).toBe("%50\\%\\_off\\\\%");
  });
});
