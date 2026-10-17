/** Extraction v2 prompt (per note or per chunk of a long note). */
export const EXTRACT_CHUNK_CHARS = 12000;

export function extractPrompt(input: {
  title: string | null;
  text: string;
  created: string | null;
  folders: string[];
  existingNames: string[];
  mode: "full" | "journal";
  chunk?: { index: number; total: number };
}) {
  const known = input.existingNames.length
    ? `\nPeople already in The Network (use these exact names when the note is clearly about them): ${input.existingNames.slice(0, 400).join("; ")}`
    : "";
  const chunk = input.chunk ? `\nThis is part ${input.chunk.index + 1} of ${input.chunk.total} of a long note; extract only what this part says.` : "";
  const journal =
    input.mode === "journal"
      ? `
JOURNAL MODE: this is a diary / day log. Only include people who are named AND about whom something memorable is said.
Keep keyFacts to what the entry states (≤3), no profile guessing; excerpt = the sentence(s) about the person, verbatim.`
      : "";
  return `Extract the people from this Apple Note. One candidate per real, identifiable person Jakob would want as a contact card.
Skip Jakob himself, companies, public figures he only read about, and people mentioned only in passing with nothing memorable.
- name: fullest form used anywhere in the note, nominative case ("z Blažem" → "Blaž"). Do not invent surnames.
- surfaces: every verbatim form the name takes in the text (declined forms, nicknames) — copy exactly.
- gender: from Slovenian grammar (rekel/rekou/bil = m; rekla/bila = f) or context; null when unclear.
- salience: 1 = the note is about this person; 0.5 = one of several main participants; 0.2 = passing mention.
- metContext: how/where/when Jakob met them, in his own words if present. metDate YYYY-MM-DD / YYYY-MM / YYYY.
- categories: mentor (Jakob learns from them), friend, partner (business partner / colleague), investor (VC/angel), client, founder (peer founder), acquaint.
- warmth (inner/active/dormant/archive) and circle (nice_to_know/hang_out_more/potential_close): only with a clear signal.
- activities: things they do or do with Jakob, lowercase English nouns ("hiking", "padel", "cross-country skiing", "hanging out", "running").
- followUps: concrete next steps Jakob wrote ("moram poklicat", "send him the deck"). when = as written; explicitDate only for a stated calendar date (YYYY-MM-DD, resolve "1.12." against the note date).
- keyFacts: ≤8 short facts useful later. Never copy whole paragraphs.
- excerpt: the most relevant passage about the person, copied VERBATIM (≤600 chars), or null.
- confidence: that this is a real identifiable person worth a card (first name only + nothing memorable → ≤0.5).${journal}
Note created: ${input.created ?? "unknown"} · Folders: ${input.folders.join(", ") || "-"} · Title: ${input.title ?? "-"}${chunk}${known}

--- NOTE TEXT ---
${input.text}`;
}

/** Splits a long note at headings / blank lines into chunks of at most `max` chars. */
export function chunkNote(text: string, max = EXTRACT_CHUNK_CHARS): string[] {
  if (text.length <= max) return [text];
  const blocks = text.split(/\n(?=#{1,3} |\s*\n)|\n{2,}/);
  const chunks: string[] = [];
  let cur = "";
  for (const b of blocks) {
    if (b.length > max) {
      if (cur) chunks.push(cur);
      cur = "";
      // Hard-split an oversized block on line boundaries.
      let rest = b;
      while (rest.length > max) {
        let cut = rest.lastIndexOf("\n", max);
        if (cut < max * 0.5) cut = max;
        chunks.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      cur = rest;
      continue;
    }
    if (cur.length + b.length + 2 > max) {
      chunks.push(cur);
      cur = b;
    } else cur = cur ? `${cur}\n\n${b}` : b;
  }
  if (cur.trim()) chunks.push(cur);
  return chunks.filter((c) => c.trim());
}
