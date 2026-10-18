/**
 * introducedBy links between committed import proposals (pure). Each committed proposal that names
 * an introducer key gets the introducer's person, following merged_into chains (a merged introducer
 * never has a person of its own) and regardless of which commit or chunk committed either side.
 */

export type IntroProposal = { id: string; key: string; status: string; mergedIntoId: string | null; committedPersonId: string | null; introducedByKey: string | null };
export type IntroLink = { proposalId: string; personId: string; introducerId: string };

export function introductionLinks(props: IntroProposal[]): IntroLink[] {
  const byId = new Map(props.map((p) => [p.id, p]));
  const byKey = new Map(props.map((p) => [p.key, p]));
  const final = (p: IntroProposal | undefined) => {
    let cur = p;
    for (let i = 0; cur?.mergedIntoId && i < 20; i++) cur = byId.get(cur.mergedIntoId);
    return cur;
  };
  const out: IntroLink[] = [];
  const linked = new Set<string>();
  for (const p of [...props].sort((a, b) => a.key.localeCompare(b.key))) {
    if (p.status !== "committed" || p.mergedIntoId || !p.committedPersonId || !p.introducedByKey) continue;
    const intro = final(byKey.get(p.introducedByKey));
    const introducerId = intro?.status === "committed" ? intro.committedPersonId : null;
    // One link per person: two proposals committed into one person keep the first introducer.
    if (!introducerId || introducerId === p.committedPersonId || linked.has(p.committedPersonId)) continue;
    linked.add(p.committedPersonId);
    out.push({ proposalId: p.id, personId: p.committedPersonId, introducerId });
  }
  return out;
}
