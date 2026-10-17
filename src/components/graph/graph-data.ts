/**
 * Client-side filtering of the relationship graph with the shared people filters, so the graph,
 * the globe and the People list agree (and it works offline from the cached index).
 */
import type { GraphLink, GraphNode } from "@/lib/queries/types";

export type GraphData = { nodes: GraphNode[]; links: GraphLink[] };

/**
 * Keep the nodes in `keep` and the links between them. A kept person whose introducer was
 * filtered out is re-attached to "me" with a `met` link (mirrors the server's behaviour), so no
 * one floats away.
 */
export function filterGraph(data: GraphData, keep: ReadonlySet<string>): GraphData {
  const nodes = data.nodes.filter((n) => keep.has(n.id));
  const kept = new Set(nodes.map((n) => n.id));
  const has = (id: string) => id === "me" || kept.has(id);
  const links: GraphLink[] = [];
  const anchored = new Set<string>();
  for (const l of data.links) {
    if (!has(l.source) || !has(l.target)) continue;
    links.push(l);
    if (l.kind !== "mention") anchored.add(l.target);
  }
  for (const n of nodes) if (!anchored.has(n.id)) links.push({ source: "me", target: n.id, kind: "met", weight: 1 });
  return { nodes, links };
}

/** "Introduced me to Ana" / "Introduced by Bor" / "Mentioned together with Cene (3)". */
export function linkLabel(l: GraphLink, selfId: string, nameOf: (id: string) => string): string {
  const other = l.source === selfId ? l.target : l.source;
  if (l.kind === "introduced") return l.source === selfId ? `Introduced ${nameOf(other)}` : `Introduced by ${nameOf(other)}`;
  if (l.kind === "mention") return `Mentioned with ${nameOf(other)}${l.weight > 1 ? ` (${l.weight}×)` : ""}`;
  return "Met directly";
}
