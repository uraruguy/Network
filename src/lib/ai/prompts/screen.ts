/** Screening prompt: decides which notes go to extraction. Full text (≤8k chars), 10 notes per call. */
export const SCREEN_MAX_CHARS = 8000;
export const SCREEN_BATCH = 10;

export function screenPrompt(items: { id: string; title: string | null; text: string; folders: string[] }[]) {
  const list = items
    .map((it) => {
      const text = it.text.length > SCREEN_MAX_CHARS ? `${it.text.slice(0, SCREEN_MAX_CHARS)}\n[… truncated, ${it.text.length} chars total]` : it.text;
      return `### ${it.id}\nFolder: ${it.folders.join(", ") || "-"}\nTitle: ${it.title ?? "-"}\n${text}`;
    })
    .join("\n\n");
  return `Classify each note below by whether it records information about specific, named people Jakob knows or met.
Kinds:
- person: the note is mainly about one specific person.
- meeting: notes from a meeting / call / event / trip with one or more identifiable people.
- list: a list of several people (e.g. potential mentors, people met at a conference).
- journal: a diary or day log ("Dnevno dogajanje", daily notes) — keep it when it mentions named people with something memorable; it will be excerpted, not filed whole.
- not_people: ideas, tasks, goals, business plans, quotes, essays, travel logs without notable named people.
A folder named after a person (e.g. "Peter", "Blaž", "Sanja") means the note is about that person — never not_people.
When in doubt between journal and not_people, pick journal if any named person appears with a fact worth remembering.
Return exactly one item per note, echoing its id.

${list}`;
}
