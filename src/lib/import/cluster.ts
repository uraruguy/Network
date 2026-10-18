/**
 * Candidate clustering for entity resolution. Clusters are deliberately generous (same first
 * name / nickname group / declension / lone surname → same cluster); the resolver decides who is
 * actually the same person inside a cluster. Existing people and decided proposals are anchors.
 */
import { deaccent, isInitial, lemmaCandidates, nameTokens, nicknameCanon, normName } from "./names";

export type ClusterNode = { id: string; kind: "mention" | "anchor"; name: string; aliases?: string[] };
export type Cluster = { id: string; label: string; nodeIds: string[]; mentionIds: string[]; anchorIds: string[]; ambiguous: boolean; distinctFullNames: string[] };

class UnionFind {
  parent = new Map<string, string>();
  find(x: string): string {
    let p = this.parent.get(x);
    if (p === undefined) {
      this.parent.set(x, x);
      return x;
    }
    while (p !== x) {
      const gp = this.parent.get(p)!;
      this.parent.set(x, gp);
      x = p;
      p = this.parent.get(x)!;
    }
    return x;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

function splitName(name: string) {
  const toks = nameTokens(name).filter((t) => !isInitial(t));
  return { toks, first: toks[0] ?? null, last: toks.length >= 2 ? toks[toks.length - 1]! : null };
}

export function clusterNodes(nodes: ClusterNode[]): Cluster[] {
  const uf = new UnionFind();
  const firstFreq = new Map<string, number>();
  const multiFirsts = new Set<string>();
  const lastIndex = new Map<string, string[]>();
  // Aliases only count when they look like names ("Kusti", "Kristjan Kustec"), not descriptions.
  const names = (n: ClusterNode) => [n.name, ...(n.aliases ?? []).filter((a) => /^\p{Lu}/u.test(a.trim()) && a.trim().split(/\s+/).length <= 4)].filter((s) => s && s.trim());

  for (const n of nodes) {
    for (const nm of names(n)) {
      const { toks, first, last } = splitName(nm);
      if (!first) continue;
      firstFreq.set(first, (firstFreq.get(first) ?? 0) + 1);
      if (toks.length >= 2) multiFirsts.add(first);
      if (last) lastIndex.set(last, [...(lastIndex.get(last) ?? []), n.id]);
    }
  }

  const canonFirst = (token: string) => {
    const c = nicknameCanon(token);
    if (c !== token) return c;
    if ((firstFreq.get(token) ?? 0) >= 2) return token;
    // A rare form that lemmatises to an attested first name is probably a declined surface form.
    for (const l of lemmaCandidates(token).slice(1)) {
      const f = deaccent(l).toLowerCase();
      if (f !== token && (firstFreq.get(f) ?? 0) >= 1) return nicknameCanon(f);
    }
    return token;
  };

  for (const n of nodes) {
    uf.find(n.id);
    for (const nm of names(n)) {
      const { toks, first } = splitName(nm);
      if (!first) continue;
      uf.union(n.id, `fn:${canonFirst(first)}`);
      // Lone surname ("Golob") joins the full-name clusters with that surname.
      if (toks.length === 1 && !multiFirsts.has(first)) for (const other of lastIndex.get(first) ?? []) uf.union(n.id, other);
    }
  }

  const groups = new Map<string, ClusterNode[]>();
  for (const n of nodes) {
    const r = uf.find(n.id);
    groups.set(r, [...(groups.get(r) ?? []), n]);
  }

  const clusters: Cluster[] = [];
  for (const members of groups.values()) {
    const mentions = members.filter((m) => m.kind === "mention");
    const anchors = members.filter((m) => m.kind === "anchor");
    const full = new Set<string>();
    let firstOnly = 0;
    for (const m of members) {
      const { toks } = splitName(m.name);
      if (toks.length >= 2) full.add(normName(m.name));
      else if (m.kind === "mention") firstOnly++;
    }
    const counts = new Map<string, number>();
    for (const m of mentions) counts.set(m.name, (counts.get(m.name) ?? 0) + 1 + (splitName(m.name).toks.length >= 2 ? 0.5 : 0));
    const label = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0]?.[0] ?? members[0]!.name;
    const ambiguous = full.size >= 2 || (anchors.length >= 1 && mentions.length >= 1) || (firstOnly >= 1 && mentions.length >= 2);
    clusters.push({
      id: "",
      label,
      nodeIds: members.map((m) => m.id),
      mentionIds: mentions.map((m) => m.id),
      anchorIds: anchors.map((m) => m.id),
      ambiguous,
      distinctFullNames: [...full],
    });
  }
  clusters.sort((a, b) => b.mentionIds.length - a.mentionIds.length || a.label.localeCompare(b.label));
  clusters.forEach((c, i) => (c.id = `c${String(i + 1).padStart(3, "0")}`));
  return clusters;
}

export type PacketPlan = {
  packetId: string;
  kind: "ambiguous" | "unique";
  clusters: { clusterId: string; label: string; mentionIds: string[]; anchorIds: string[]; part: string | null; siblings: string[] }[];
};

/**
 * Packs clusters into resolution packets: ambiguous clusters whole (~40–60 mentions per packet;
 * clusters above the max are split into parts that carry summaries of their siblings), unique
 * clusters ~40 mentions per packet.
 */
export function packClusters(
  clusters: Cluster[],
  opts: { maxAmbiguous?: number; targetAmbiguous?: number; maxUnique?: number; splitSize?: number; surfaceOf: (mentionId: string) => string; summarize: (mentionIds: string[]) => string },
): PacketPlan[] {
  const maxA = opts.maxAmbiguous ?? 60;
  const targetA = opts.targetAmbiguous ?? 45;
  const maxU = opts.maxUnique ?? 40;
  const splitSize = opts.splitSize ?? 50;
  const packets: PacketPlan[] = [];
  let n = 0;
  const newPacket = (kind: PacketPlan["kind"]): PacketPlan => {
    const p: PacketPlan = { packetId: `r${String(++n).padStart(2, "0")}`, kind, clusters: [] };
    packets.push(p);
    return p;
  };
  const size = (p: PacketPlan) => p.clusters.reduce((s, c) => s + c.mentionIds.length, 0);

  const amb = clusters.filter((c) => c.ambiguous && c.mentionIds.length);
  const uni = clusters.filter((c) => !c.ambiguous && c.mentionIds.length);

  // Oversized clusters → their own packets, split by surface so identical names stay together.
  for (const c of amb.filter((c) => c.mentionIds.length > maxA)) {
    const sorted = [...c.mentionIds].sort((a, b) => normName(opts.surfaceOf(a)).localeCompare(normName(opts.surfaceOf(b))) || a.localeCompare(b));
    const parts: string[][] = [];
    for (let i = 0; i < sorted.length; i += splitSize) parts.push(sorted.slice(i, i + splitSize));
    parts.forEach((ids, i) => {
      const p = newPacket("ambiguous");
      p.clusters.push({
        clusterId: c.id,
        label: c.label,
        mentionIds: ids,
        anchorIds: c.anchorIds,
        part: `${i + 1}/${parts.length}`,
        siblings: parts.map((other, j) => (j === i ? null : `part ${j + 1}/${parts.length}: ${opts.summarize(other)}`)).filter((s): s is string => !!s),
      });
    });
  }

  let cur: PacketPlan | null = null;
  for (const c of amb.filter((c) => c.mentionIds.length <= maxA)) {
    if (!cur || size(cur) >= targetA || size(cur) + c.mentionIds.length > maxA) cur = newPacket("ambiguous");
    cur.clusters.push({ clusterId: c.id, label: c.label, mentionIds: c.mentionIds, anchorIds: c.anchorIds, part: null, siblings: [] });
  }
  cur = null;
  for (const c of uni) {
    if (!cur || size(cur) + c.mentionIds.length > maxU) cur = newPacket("unique");
    cur.clusters.push({ clusterId: c.id, label: c.label, mentionIds: c.mentionIds, anchorIds: c.anchorIds, part: null, siblings: [] });
  }
  return packets;
}
