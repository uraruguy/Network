/**
 * Human labels for tool calls in the chat ("Searching notes…" → "Searched notes · 4"). Pure.
 * Unknown tools fall back to their name.
 */

type Labels = { running: string; done: string; failed: string; summary?: (output: Record<string, unknown>) => string | null };

const count = (noun: string, plural = `${noun}s`) => (o: Record<string, unknown>) =>
  typeof o.count === "number" ? `${o.count} ${o.count === 1 ? noun : plural}` : null;

const LABELS: Record<string, Labels> = {
  search_people: { running: "Searching people", done: "Searched people", failed: "Couldn't search people", summary: count("person", "people") },
  get_person: { running: "Opening profile", done: "Read profile", failed: "Couldn't open profile", summary: (o) => (typeof o.name === "string" ? o.name : null) },
  list_notes: { running: "Reading notes", done: "Read notes", failed: "Couldn't read notes", summary: count("note") },
  recent_interactions: { running: "Checking recent contact", done: "Checked recent contact", failed: "Couldn't check recent contact", summary: count("result") },
  search_notes: { running: "Searching notes", done: "Searched notes", failed: "Couldn't search notes", summary: count("match", "matches") },
  people_by_place: { running: "Searching nearby", done: "Searched nearby", failed: "Couldn't find that place", summary: count("person", "people") },
  due_followups: { running: "Checking follow-ups", done: "Checked follow-ups", failed: "Couldn't check follow-ups", summary: count("follow-up") },
  list_taxonomy: { running: "Reading categories", done: "Read categories", failed: "Couldn't read categories" },
  add_note: { running: "Adding note", done: "Note added", failed: "Couldn't add note", summary: (o) => (typeof o.person === "string" ? o.person : null) },
  create_person: { running: "Adding person", done: "Person added", failed: "Couldn't add person", summary: (o) => (typeof o.name === "string" ? o.name : null) },
  update_person: { running: "Updating person", done: "Person updated", failed: "Couldn't update person", summary: (o) => (typeof o.name === "string" ? o.name : null) },
  create_followup: { running: "Scheduling follow-up", done: "Follow-up scheduled", failed: "Couldn't schedule follow-up", summary: (o) => (typeof o.person === "string" ? o.person : null) },
  complete_followup: { running: "Completing follow-up", done: "Follow-up done", failed: "Couldn't complete follow-up" },
};

export type ToolState = "running" | "done" | "failed";

export function toolLabel(name: string, state: ToolState, output?: unknown): { label: string; detail: string | null; error: string | null } {
  const l = LABELS[name] ?? { running: name.replace(/_/g, " "), done: name.replace(/_/g, " "), failed: `${name.replace(/_/g, " ")} failed` };
  const o = output && typeof output === "object" ? (output as Record<string, unknown>) : null;
  // Tools report recoverable failures as `{ error, hint }` values rather than exceptions.
  const softError = o && typeof o.error === "string" ? o.error : null;
  if (state === "failed" || softError) return { label: l.failed, detail: null, error: softError };
  if (state === "running") return { label: l.running, detail: null, error: null };
  return { label: l.done, detail: o && l.summary ? l.summary(o) : null, error: null };
}

export const isWriteTool = (name: string) => ["add_note", "create_person", "update_person", "create_followup", "complete_followup"].includes(name);
