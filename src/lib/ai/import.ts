import { generateText, Output } from "ai";
import { aiFastModel, aiModel } from "./provider";
import { classificationSchema, extractionSchema, type Classification, type Extraction } from "./import-schemas";

const SYSTEM = `You help Jakob (20, founder from Ljubljana, Slovenia; often in Berlin and San Francisco) organise his personal network.
His notes are written in colloquial Slovenian (Gorenjska dialect) mixed with English. Read both fluently.
Be precise, never invent facts. Prefer null over guessing. Keep names exactly as written (diacritics included).`;

export async function classifyBatch(items: { id: string; title: string | null; text: string; folder: string | null }[]): Promise<Classification[]> {
  const list = items
    .map((it) => `### ${it.id}\nFolder: ${it.folder ?? "-"}\nTitle: ${it.title ?? "-"}\n${it.text.slice(0, 700)}`)
    .join("\n\n");
  const { output } = await generateText({
    model: aiFastModel(),
    system: SYSTEM,
    output: Output.object({ schema: classificationSchema, name: "classification" }),
    prompt: `Classify each note below. A note is about people when it records information about specific, named humans Jakob has met or wants to remember (who they are, what they said, how they met). Meeting notes with a named counterpart count. Daily diary entries, company/task notes, quotes, ideas, travel logs without notable people are not_people.\n\n${list}`,
  });
  return output.items;
}

export async function extractNote(input: { title: string | null; text: string; html: string | null; created: string | null; folder: string | null; existingNames: string[] }): Promise<Extraction> {
  const known = input.existingNames.length ? `\nPeople already in The Network (use these exact names when the note is about them): ${input.existingNames.slice(0, 400).join("; ")}` : "";
  const { output } = await generateText({
    model: aiModel(),
    system: SYSTEM,
    output: Output.object({ schema: extractionSchema, name: "extraction" }),
    prompt: `Extract the people from this Apple Note into structured candidates. One candidate per real person Jakob would want as a contact card. Skip Jakob himself, companies, and people mentioned only in passing with nothing memorable.
- metContext: how/where/when Jakob met them — in his own words if present.
- categories: mentor (someone Jakob learns from / wants as mentor), friend, partner (business partner / colleague on a project), investor (VC/angel), client, founder (peer founder), acquaint.
- warmth: inner (very close), active (in touch), dormant, archive. circle: how close Jakob wants them: nice_to_know / hang_out_more / potential_close. Only set when the note gives a signal.
- hobbies only when explicitly mentioned.
- followUps: concrete next steps Jakob wrote (CTA, "moram poklicat", "send him…").
- keyFacts: short, factual, useful later.
Note created: ${input.created ?? "unknown"} · Folder: ${input.folder ?? "-"} · Title: ${input.title ?? "-"}${known}

--- NOTE TEXT ---
${input.text.slice(0, 12000)}`,
  });
  return output;
}
