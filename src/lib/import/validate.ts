/** Invariant checks for subagent output files (zod shape + cross-references against the packet). */
import { FilingFile, FilingPacket, ResolutionFile, ResolvePacket, formatIssues } from "./contracts";

export type ValidationResult<T> = { ok: boolean; errors: string[]; warnings: string[]; data: T | null };

/**
 * ResolutionFile invariants:
 *  - matches the schema; packetId matches the packet
 *  - every packet mentionId is assigned exactly once, no unknown mentionIds
 *  - person keys unique; every assigned key is declared in the file or is an anchor proposal key
 *  - existingPersonId refers to an existing person (anchor of kind person, or `personExists`)
 */
export function validateResolution(raw: unknown, packetRaw: unknown, personExists?: (id: string) => boolean): ValidationResult<ResolutionFile> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsed = ResolutionFile.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: formatIssues(parsed.error), warnings, data: null };
  const packetParsed = ResolvePacket.safeParse(packetRaw);
  if (!packetParsed.success) return { ok: false, errors: [`packet is invalid: ${formatIssues(packetParsed.error).join("; ")}`], warnings, data: null };
  const file = parsed.data;
  const packet = packetParsed.data;
  if (file.packetId !== packet.packetId) errors.push(`packetId ${file.packetId} does not match packet ${packet.packetId}`);

  const keys = new Map<string, number>();
  for (const p of file.people) keys.set(p.key, (keys.get(p.key) ?? 0) + 1);
  for (const [k, n] of keys) if (n > 1) errors.push(`person key "${k}" declared ${n} times`);
  const anchorKeys = new Set(packet.anchors.filter((a) => a.kind === "proposal" && a.key).map((a) => a.key!));
  const anchorPeople = new Set(packet.anchors.filter((a) => a.kind === "person").map((a) => a.id));

  const expected = new Set(packet.mentions.map((m) => m.mentionId));
  const seen = new Map<string, number>();
  for (const a of file.assignments) {
    seen.set(a.mentionId, (seen.get(a.mentionId) ?? 0) + 1);
    if (!expected.has(a.mentionId)) errors.push(`assignment for unknown mentionId ${a.mentionId}`);
    if (a.personKey && !keys.has(a.personKey) && !anchorKeys.has(a.personKey)) errors.push(`${a.mentionId} → undeclared key "${a.personKey}"`);
  }
  for (const id of expected) {
    const n = seen.get(id) ?? 0;
    if (n === 0) errors.push(`mention ${id} is not assigned`);
    if (n > 1) errors.push(`mention ${id} assigned ${n} times`);
  }

  const used = new Set(file.assignments.map((a) => a.personKey).filter(Boolean));
  for (const p of file.people) {
    if (p.existingPersonId && !anchorPeople.has(p.existingPersonId) && !(personExists?.(p.existingPersonId) ?? false)) errors.push(`${p.key}: existingPersonId ${p.existingPersonId} does not exist`);
    if (!used.has(p.key) && !anchorKeys.has(p.key)) warnings.push(`${p.key} is declared but no mention is assigned to it`);
    if (p.profile.introducedByKey && !keys.has(p.profile.introducedByKey) && !anchorKeys.has(p.profile.introducedByKey)) warnings.push(`${p.key}: introducedByKey "${p.profile.introducedByKey}" is unknown`);
    if (p.disposition === "person" && /^jakob( kav[cč]i[cč])?$/i.test(p.displayName.trim())) warnings.push(`${p.key}: "${p.displayName}" looks like Jakob himself (disposition self?)`);
    if (p.confidence < 0.85 && !p.needsReview && p.disposition === "person") warnings.push(`${p.key}: confidence ${p.confidence} without needsReview`);
    for (const f of p.profile.followUps) if (f.sourceItemId && !packet.mentions.some((m) => m.itemId === f.sourceItemId)) warnings.push(`${p.key}: followUp sourceItemId ${f.sourceItemId} is not a note in this packet`);
  }
  return { ok: errors.length === 0, errors, warnings, data: file };
}

/** FilingFile invariants: items belong to the packet, keys are people of that note, excerpts verbatim. */
export function validateFiling(raw: unknown, packetRaw: unknown, itemText: (itemId: string) => string | null): ValidationResult<FilingFile> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsed = FilingFile.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: formatIssues(parsed.error), warnings, data: null };
  const packetParsed = FilingPacket.safeParse(packetRaw);
  if (!packetParsed.success) return { ok: false, errors: [`packet is invalid: ${formatIssues(packetParsed.error).join("; ")}`], warnings, data: null };
  const file = parsed.data;
  const packet = packetParsed.data;
  if (file.packetId !== packet.packetId) errors.push(`packetId ${file.packetId} does not match packet ${packet.packetId}`);
  const items = new Map(packet.items.map((i) => [i.itemId, i]));
  const seen = new Set<string>();
  for (const f of file.filings) {
    const it = items.get(f.itemId);
    if (!it) {
      errors.push(`${f.itemId} is not in packet ${packet.packetId}`);
      continue;
    }
    if (seen.has(f.itemId)) errors.push(`${f.itemId} filed twice`);
    seen.add(f.itemId);
    const keys = new Set(it.people.map((p) => p.personKey));
    if (f.mode === "primary" && (!f.primaryPersonKey || !keys.has(f.primaryPersonKey))) errors.push(`${f.itemId}: primaryPersonKey "${f.primaryPersonKey}" is not a person in this note (${[...keys].join(", ")})`);
    const text = itemText(f.itemId);
    for (const e of f.excerpts) {
      if (!keys.has(e.personKey)) errors.push(`${f.itemId}: excerpt for unknown person "${e.personKey}"`);
      if (text != null && !text.includes(e.excerpt)) errors.push(`${f.itemId}: excerpt for ${e.personKey} is not verbatim note text`);
    }
  }
  for (const id of items.keys()) if (!seen.has(id)) warnings.push(`${id} not filed (stays unfiled)`);
  return { ok: errors.length === 0, errors, warnings, data: file };
}
