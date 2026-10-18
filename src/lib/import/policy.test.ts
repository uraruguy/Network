import { describe, expect, it } from "vitest";
import { decidePolicy, type PolicyInput } from "./policy";

const base: PolicyInput = { disposition: "person", confidence: 0.9, reviewFlags: [], displayName: "Blaž Novak", mentionConfidences: [0.9] };

describe("decidePolicy", () => {
  it("auto-approves confident full names without flags", () => {
    expect(decidePolicy(base)).toMatchObject({ status: "approved", needsReview: false, rule: "auto_approve" });
  });
  it("auto-approves first-name-only people with ≥2 consistent mentions", () => {
    expect(decidePolicy({ ...base, displayName: "Blaž", mentionConfidences: [0.9, 0.8] }).status).toBe("approved");
    expect(decidePolicy({ ...base, displayName: "Blaž", mentionConfidences: [0.9, 0.5] }).status).toBe("proposed");
  });
  it("first name only with one mention goes to review", () => {
    expect(decidePolicy({ ...base, displayName: "Blaž" })).toMatchObject({ status: "proposed", needsReview: true });
  });
  it("flags, low confidence or an explicit resolver request go to review", () => {
    expect(decidePolicy({ ...base, reviewFlags: ["possible_duplicate"] }).status).toBe("proposed");
    expect(decidePolicy({ ...base, confidence: 0.84 }).status).toBe("proposed");
    expect(decidePolicy({ ...base, resolverNeedsReview: true }).status).toBe("proposed");
  });
  it("first+last name fields count as a full name", () => {
    expect(decidePolicy({ ...base, displayName: "Blaž", firstName: "Blaž", lastName: "Novak" }).status).toBe("approved");
  });
  it("auto-rejects confident passerby / not_person / self but keeps them listed", () => {
    expect(decidePolicy({ ...base, disposition: "passerby", confidence: 0.8 })).toMatchObject({ status: "rejected", needsReview: false });
    expect(decidePolicy({ ...base, disposition: "not_person", confidence: 0.95 }).status).toBe("rejected");
    expect(decidePolicy({ ...base, disposition: "self", confidence: 0.99 }).status).toBe("rejected");
    expect(decidePolicy({ ...base, disposition: "passerby", confidence: 0.7 })).toMatchObject({ status: "proposed", needsReview: true });
  });
});
