import { describe, expect, it } from "vitest";
import { clusterNodes, packClusters, type ClusterNode } from "./cluster";

const m = (id: string, name: string, aliases: string[] = []): ClusterNode => ({ id, kind: "mention", name, aliases });
const a = (id: string, name: string): ClusterNode => ({ id, kind: "anchor", name });

function clusterOf(clusters: ReturnType<typeof clusterNodes>, id: string) {
  return clusters.find((c) => c.nodeIds.includes(id))!;
}

describe("clusterNodes", () => {
  it("groups same first name, declensions and full names", () => {
    const cs = clusterNodes([m("1", "Blaž"), m("2", "Blaž Novak"), m("3", "Blažem"), m("4", "Blaž"), m("5", "Kaja")]);
    const c = clusterOf(cs, "1");
    expect(c.mentionIds.sort()).toEqual(["1", "2", "3", "4"]);
    expect(c.ambiguous).toBe(true);
    expect(clusterOf(cs, "5").mentionIds).toEqual(["5"]);
    expect(clusterOf(cs, "5").ambiguous).toBe(false);
  });

  it("uses nickname groups", () => {
    const cs = clusterNodes([m("1", "Aleks"), m("2", "Alex Brown"), m("3", "Aleksander Kos")]);
    expect(clusterOf(cs, "1").mentionIds.sort()).toEqual(["1", "2", "3"]);
  });

  it("joins lone surnames to full-name clusters", () => {
    const cs = clusterNodes([m("1", "Peter Golob"), m("2", "Golob"), m("3", "Peter")]);
    expect(clusterOf(cs, "2").mentionIds.sort()).toEqual(["1", "2", "3"]);
  });

  it("does not merge different first names that share a surname", () => {
    const cs = clusterNodes([m("1", "Ana Novak"), m("2", "Blaž Novak")]);
    expect(clusterOf(cs, "1").mentionIds).toEqual(["1"]);
  });

  it("links aliases (nickname → real name)", () => {
    const cs = clusterNodes([m("1", "Kusti", ["Kristjan Kustec"]), m("2", "Kristjan")]);
    expect(clusterOf(cs, "1").mentionIds.sort()).toEqual(["1", "2"]);
  });

  it("anchors make a cluster ambiguous", () => {
    const cs = clusterNodes([m("1", "Urh Kovačič"), a("p1", "Urh Kovačič")]);
    const c = clusterOf(cs, "1");
    expect(c.anchorIds).toEqual(["p1"]);
    expect(c.ambiguous).toBe(true);
  });

  it("unique full name repeated is not ambiguous", () => {
    const cs = clusterNodes([m("1", "Domen Rubin"), m("2", "Domen Rubin")]);
    expect(clusterOf(cs, "1").ambiguous).toBe(false);
  });

  it("rare declined forms join the attested base name, frequent names stay apart", () => {
    const cs = clusterNodes([m("1", "Jana"), m("2", "Jana"), m("3", "Jani"), m("4", "Jani"), m("5", "Janija")]);
    expect(clusterOf(cs, "5").mentionIds.sort()).toEqual(["3", "4", "5"]);
    expect(clusterOf(cs, "1").mentionIds.sort()).toEqual(["1", "2"]);
  });
});

describe("packClusters", () => {
  it("splits oversized clusters and packs the rest", () => {
    const nodes: ClusterNode[] = [];
    for (let i = 0; i < 70; i++) nodes.push(m(`b${i}`, i % 2 ? "Blaž" : "Blaž Novak"));
    ["Ana", "Bor", "Cene", "Dora", "Eva", "Filip", "Gal", "Hana", "Iza", "Lan"].forEach((n, i) => nodes.push(m(`u${i}`, `${n} Unique`)));
    for (let i = 0; i < 6; i++) nodes.push(m(`k${i}`, i ? "Kaja" : "Kaja Kos"));
    const cs = clusterNodes(nodes);
    const surface = new Map(nodes.map((n) => [n.id, n.name]));
    const packets = packClusters(cs, { surfaceOf: (id) => surface.get(id)!, summarize: (ids) => `${ids.length} mentions` });
    const blaz = packets.filter((p) => p.clusters.some((c) => c.label.startsWith("Blaž")));
    expect(blaz.length).toBe(2);
    expect(blaz[0]!.clusters[0]!.part).toBe("1/2");
    expect(blaz[0]!.clusters[0]!.siblings[0]).toMatch(/part 2\/2/);
    const all = packets.flatMap((p) => p.clusters.flatMap((c) => c.mentionIds));
    expect(new Set(all).size).toBe(nodes.length);
    expect(packets.some((p) => p.kind === "unique")).toBe(true);
  });
});
