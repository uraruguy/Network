import { describe, expect, it } from "vitest";
import { decideFiling, type FilingInput, type FilingMention, type FilingPerson } from "./filing";

const person = (key: string, displayName: string, extra: Partial<FilingPerson> = {}): FilingPerson => ({ proposalId: `p-${key}`, key, displayName, aliases: [], status: "approved", disposition: "person", ...extra });
const mention = (i: number, surface: string, p: FilingPerson | null, extra: Partial<FilingMention> = {}): FilingMention => ({ mentionId: `item:${i}`, candidateIndex: i, surface, salience: null, confidence: 0.8, person: p, dismissed: false, ...extra });
const input = (mentions: FilingMention[], extra: Partial<FilingInput> = {}): FilingInput => ({ itemId: "item", title: null, folders: ["Notes"], classification: "meeting", extractionVersion: 2, mentions, personFolder: null, folderCandidates: [], ...extra });

const blaz = person("blaz-novak", "Blaž Novak", { aliases: ["Blaž"] });
const kaja = person("kaja-horvat", "Kaja Horvat");
const matt = person("matt-fisher", "Matt Fisher");

describe("decideFiling", () => {
  it("waits while mentions are unresolved", () => {
    expect(decideFiling(input([mention(0, "Blaž", null)])).mode).toBe("pending");
  });
  it("title wins, with declined forms (z Blažem)", () => {
    const d = decideFiling(input([mention(0, "Kaja", kaja), mention(1, "Blaž", blaz)], { title: "Kava z Blažem" }));
    expect(d).toMatchObject({ mode: "primary", primaryMentionId: "item:1", rule: "title" });
  });
  it("person-named folder", () => {
    const d = decideFiling(input([mention(0, "Blaž", blaz), mention(1, "Miha", person("miha-golob", "Miha Golob"))], { title: "Padel petek", folders: ["Blaž"], personFolder: "Blaž" }));
    expect(d).toMatchObject({ mode: "primary", primaryMentionId: "item:0", rule: "folder" });
  });
  it("single fileable person (others rejected or dismissed)", () => {
    const d = decideFiling(
      input([mention(0, "Jakob", person("jakob", "Jakob", { disposition: "self", status: "rejected" })), mention(1, "Marko", null, { dismissed: true }), mention(2, "Kaja", kaja)], { title: "Kosilo z ekipo" }),
    );
    expect(d).toMatchObject({ mode: "primary", primaryMentionId: "item:2", rule: "single" });
  });
  it("clear salience", () => {
    const d = decideFiling(input([mention(0, "Matt", matt, { salience: 0.9 }), mention(1, "Kaja", kaja, { salience: 0.3 })], { title: "Call" }));
    expect(d).toMatchObject({ mode: "primary", primaryMentionId: "item:0", rule: "salience" });
  });
  it("unclear when nothing decides", () => {
    expect(decideFiling(input([mention(0, "Matt", matt, { salience: 0.5 }), mention(1, "Blaž", blaz, { salience: 0.5 })], { title: "Večerja v SF" })).mode).toBe("unclear");
  });
  it("v1 person note → main candidate", () => {
    const d = decideFiling(input([mention(0, "Matt", matt, { confidence: 0.9 }), mention(1, "Kaja", kaja, { confidence: 0.5 })], { extractionVersion: 1, classification: "person", title: "x" }));
    expect(d).toMatchObject({ mode: "primary", rule: "v1-main", primaryMentionId: "item:0" });
  });
  it("list and journal notes", () => {
    expect(decideFiling(input([mention(0, "Kaja", kaja)], { classification: "list" })).mode).toBe("list");
    expect(decideFiling(input([mention(0, "Kaja", kaja)], { classification: "person", folders: ["Dnevno dogajanje"] })).mode).toBe("journal");
  });
  it("dismisses notes without people, unless a person folder has exactly one candidate", () => {
    expect(decideFiling(input([mention(0, "Bolt", null, { dismissed: true })])).mode).toBe("dismiss");
    const d = decideFiling(input([mention(0, "Bolt", null, { dismissed: true })], { personFolder: "Peter", folderCandidates: [person("peter-rozman", "Peter Rozman")] }));
    expect(d).toMatchObject({ mode: "primary-folder", rule: "folder" });
  });
});
