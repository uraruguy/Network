/** Instructions for filing notes the deterministic rules could not place (rendered into BRIEF-filing.md). */

export const FILING_RULES = `## Filing rules
Each item is one Apple note that mentions several resolved people. Decide where it lives:
- \`primary\` — the note is mainly about / with one person → \`primaryPersonKey\`. The note is copied
  verbatim under that person; everyone else in it gets a mention link.
  Signals: the title ("Kava z Blažem", "Call x Ingo"), who the note is addressed to or about, who says
  the most, the person-named folder.
- \`list\` — a list of people (each gets an excerpt with their own lines). Provide \`excerpts\`
  (\`{personKey, excerpt}\`, excerpt copied VERBATIM from the note) for people whose lines are not obvious.
- \`journal\` — a diary/day log (each person gets the sentences about them as an excerpt).
- \`dismiss\` — nothing worth keeping about any person (\`dismissReason\`).
\`reason\`: ≤300 chars.`;

export const FILING_EXAMPLE = {
  packetId: "f01",
  engine: "claude-code",
  schemaVersion: 1,
  filings: [
    { itemId: "<itemId>", mode: "primary", primaryPersonKey: "blaz-novak", excerpts: [], dismissReason: null, reason: "Title 'Kava z Blažem'; Kaja only joins at the end." },
    { itemId: "<itemId>", mode: "journal", primaryPersonKey: null, excerpts: [{ personKey: "kaja-horvat", excerpt: "Kaja je rekla, da gre v Berlin." }], dismissReason: null, reason: "Day log" },
  ],
};

export function buildFilingBrief(input: { runId: string; runDir: string; packets: { packetId: string; items: number }[]; validateCmd: string }) {
  return `# File notes — run ${input.runId}

Work in \`${input.runDir}\`. For each \`filing/<id>.json\` packet: read the items (and their notes in
\`notes/\`), write \`filing-out/<id>.json\` (FilingFile), then run \`${input.validateCmd} filing-out/<id>.json\`.
Do not edit anything else.

${FILING_RULES}

## Output format (FilingFile, schemaVersion 1)
\`\`\`json
${JSON.stringify(FILING_EXAMPLE, null, 2)}
\`\`\`

## Packets
${input.packets.map((p) => `- \`filing/${p.packetId}.json\` (${p.items} notes)`).join("\n")}
`;
}
