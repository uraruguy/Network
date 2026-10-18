import { describe, expect, it } from "vitest";
import { introductionLinks, type IntroProposal } from "./introductions";

const p = (key: string, o: Partial<IntroProposal> = {}): IntroProposal => ({ id: `id-${key}`, key, status: "committed", mergedIntoId: null, committedPersonId: `person-${key}`, introducedByKey: null, ...o });

describe("introductionLinks", () => {
  it("links people committed in different runs", () => {
    expect(introductionLinks([p("ana", { introducedByKey: "bor" }), p("bor")])).toEqual([{ proposalId: "id-ana", personId: "person-ana", introducerId: "person-bor" }]);
  });

  it("follows merge chains to the surviving introducer", () => {
    const links = introductionLinks([
      p("ana", { introducedByKey: "bor-1" }),
      p("bor-1", { status: "merged", mergedIntoId: "id-bor-2", committedPersonId: null }),
      p("bor-2", { status: "merged", mergedIntoId: "id-bor", committedPersonId: null }),
      p("bor"),
    ]);
    expect(links).toEqual([{ proposalId: "id-ana", personId: "person-ana", introducerId: "person-bor" }]);
  });

  it("waits for an introducer that isn't committed yet", () => {
    expect(introductionLinks([p("ana", { introducedByKey: "bor" }), p("bor", { status: "approved", committedPersonId: null })])).toEqual([]);
  });

  it("skips uncommitted and merged people, self-introductions and unknown keys", () => {
    expect(
      introductionLinks([
        p("ana", { status: "approved", committedPersonId: null, introducedByKey: "bor" }),
        p("cene", { status: "merged", mergedIntoId: "id-bor", introducedByKey: "bor" }),
        p("bor", { introducedByKey: "bor" }),
        p("dan", { introducedByKey: "nobody" }),
      ]),
    ).toEqual([]);
  });

  it("one link per person when two proposals were committed into the same person", () => {
    const links = introductionLinks([p("ana", { introducedByKey: "bor" }), p("ana-2", { committedPersonId: "person-ana", introducedByKey: "cene" }), p("bor"), p("cene")]);
    expect(links).toEqual([{ proposalId: "id-ana", personId: "person-ana", introducerId: "person-bor" }]);
  });
});
