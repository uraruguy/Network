/**
 * The single source of the entity-resolution instructions. prepare.ts renders BRIEF-resolve.md
 * from this for Claude subagents (Claude Code on the Max subscription, $0).
 */

export const RESOLVE_RULES = `## Who is who — rules

**Goal.** Decide which mentions in this packet refer to the same real person, give every real person one
stable key and a merged profile, and assign every mention exactly once.

### Identity
1. **Same first name ≠ same person.** Jakob knows ~15 people called Blaž, Jana, Jani, Kaja, Miha. Merge two
   mentions only with strong signals:
   - a person-named folder (folder "Blaž" → the notes are about one specific Blaž),
   - overlapping co-mentions (the same other people appear around them),
   - matching company / role / city / school,
   - an explicit link in the text ("Blaž (Novak)", "Kusti = Kristjan"),
   - temporal + topic proximity (same project, same weeks, same trip).
   One weak signal is not enough. When unsure, keep them apart and set \`needsReview\` + a flag.
2. **Declensions and dialect.** Slovenian names decline (Blaž/Blaža/Blažu/Blažem, Kaja/Kaje/Kaji/Kajo,
   Miha/Miho, Jani/Janija/Janiju). "Jani" can also be the dative of Jana — use \`gender\`/\`genderHint\`
   (rekel/rekou = m, rekla = f) and context. Gorenjska dialect: rekou = rekel, biu = bil, šou = šel.
3. **Nicknames** (Aleks/Alex/Aleksander, Jani/Janez, Matjo/Matjaž) are hints, never proof.
4. **Full names win.** A bare "Peter" joins "Peter Golob" only with the signals above. A lone surname
   ("Golob") usually means the full-name person.
5. **Existing people.** \`anchors\` of kind \`person\` are already in The Network. Set
   \`existingPersonId\` ONLY when you are certain (full name match + consistent context, or explicit).
   Anchors of kind \`proposal\` are people resolved in an earlier run — reuse their \`key\` to assign
   mentions to them (do not redeclare them unless you add information; never change a proposal
   "decided by Jakob").

### Disposition
- \`person\` — a real, identifiable person Jakob would want a contact card for.
- \`passerby\` — real but incidental (a waiter, a speaker he only watched, someone named once with nothing memorable).
- \`not_person\` — extraction error: a company, product, place, group, pet, public figure he only read about.
- \`self\` — Jakob himself (Jakob, Jakob Kavčič, "jaz").

### Keys and names
- \`key\`: lowercase slug of the full name ("blaz-novak"). First-name-only people get a disambiguator
  from their strongest context: "blaz-goolets", "kaja-sf", "miha-padel". Keys must be unique in the file.
- \`displayName\`: the fullest correct name; \`firstName\`/\`lastName\` when known; \`aliases\`: every other
  spelling/nickname/declined form you saw.

### Profile (merge across the person's mentions)
- Scalars (role, company, city, country, metContext, metDate, metCity, warmth, circle, howICanHelp,
  whatICanAsk): the most specific, most recent value that the notes support. Never invent.
- \`categories\`: mentor | friend | partner | investor | client | founder | acquaint (union, keep it honest).
- \`activities\`: lowercase English ("hiking", "padel", "cross-country skiing", "hanging out").
- \`keyFacts\`: ≤8 short, useful facts (dedupe, newest first).
- \`followUps\`: concrete next steps with the \`sourceItemId\` of the note they came from.
- \`firstSeen\`/\`lastSeen\`: earliest/latest note date (YYYY-MM-DD) among the person's mentions.
- \`introducedByKey\`: key of the person who introduced them, if stated and that person is in this packet or the anchors.

### Confidence (per person, and per assignment)
- **0.95** certain (full name + consistent context, or explicit link)
- **0.85** very likely (several consistent signals) — the bar for auto-approval
- **0.6** plausible but unproven (one signal; first name only)
- **< 0.5** a guess — prefer splitting and flagging
\`needsReview: true\` whenever Jakob should look (merges on weak evidence, first name only with a single
mention, conflicting facts). Flags: first_name_only, ambiguous_first_name, possible_duplicate,
existing_match_uncertain, gender_conflict, conflicting_facts, low_evidence, split_candidate, self_uncertain.
\`possibleSameAs\`: keys (or existing person ids) you suspect are the same person but could not prove.
\`reasons\`: ≤300 chars, the evidence you used (folders, co-mentions, companies, dates).

### Evidence
Each mention carries snippets, but **read the full note** (\`noteFile\`, relative to the run directory)
whenever the decision is not obvious. Oversized clusters come in parts: \`siblings\` summarise the other
parts — use the same key for the same person across parts.`;

export const RESOLUTION_EXAMPLE = {
  packetId: "r01",
  engine: "claude-code",
  model: "opus",
  schemaVersion: 1,
  people: [
    {
      key: "blaz-novak",
      displayName: "Blaž Novak",
      firstName: "Blaž",
      lastName: "Novak",
      aliases: ["Blaž", "Blažem"],
      disposition: "person",
      existingPersonId: null,
      confidence: 0.92,
      needsReview: false,
      reviewFlags: [],
      possibleSameAs: [],
      reasons: "Folder Blaž (6 notes) + 'Blaž Novak' in two Goolets notes with the same co-mentions.",
      profile: {
        role: "CTO",
        company: "Goolets",
        city: "Ljubljana",
        country: "Slovenia",
        metContext: "Goolets kickoff",
        metDate: "2024-05",
        metCity: null,
        warmth: "active",
        circle: "hang_out_more",
        categories: ["partner", "friend"],
        activities: ["padel"],
        tags: [],
        keyFacts: ["Leads the Goolets booking engine"],
        howICanHelp: null,
        whatICanAsk: "Infra advice",
        links: [],
        introducedByKey: null,
        followUps: [{ what: "Send him the deck", when: "do 1.12.", sourceItemId: "<itemId>" }],
        firstSeen: "2024-05-03",
        lastSeen: "2026-09-12",
      },
    },
  ],
  assignments: [
    { mentionId: "<itemId>:0", personKey: "blaz-novak", confidence: 0.95, reason: "folder Blaž" },
    { mentionId: "<itemId>:2", personKey: null, confidence: 0.9, reason: "a restaurant, not a person" },
  ],
};

export function buildResolveBrief(input: { runId: string; runDir: string; packets: { packetId: string; kind: string; mentions: number; clusters: string[] }[]; validateCmd: string }) {
  const list = input.packets.map((p) => `- \`packets/${p.packetId}.json\` (${p.kind}, ${p.mentions} mentions): ${p.clusters.slice(0, 8).join(", ")}${p.clusters.length > 8 ? ", …" : ""}`).join("\n");
  return `# Resolve people — run ${input.runId}

You are resolving who is who in Jakob's Apple Notes import. Work in \`${input.runDir}\`.
Each packet is independent; one subagent per packet is ideal.

**For your packet \`packets/<id>.json\`:**
1. Read the packet: \`clusters\` (groups of mentions that share a first name / nickname / surname),
   \`mentions\` (one per extracted candidate, with snippets, folders, dates, co-mentions, gender hints) and
   \`anchors\` (people already in The Network, and people resolved in earlier runs).
2. Read \`index.md\` for the overall picture and the notes in \`notes/\` for evidence.
3. Write \`resolutions/<id>.json\` — a ResolutionFile (format below). Every \`mentionId\` of the packet must be
   assigned exactly once (\`personKey: null\` only for mentions that are not a person at all).
4. Validate: \`${input.validateCmd} resolutions/<id>.json\` — fix every error, then stop.
Do not edit the database or any other file.

${RESOLVE_RULES}

## Output format (ResolutionFile, schemaVersion 1)

\`\`\`json
${JSON.stringify(RESOLUTION_EXAMPLE, null, 2)}
\`\`\`

## Packets
${list}
`;
}
