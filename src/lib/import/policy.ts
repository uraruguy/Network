/**
 * Auto-decision policy for resolved people. Only clear cases are decided automatically;
 * everything else goes to Jakob's review queue.
 */
import { isFullName } from "./names";

export type PolicyInput = {
  disposition: "person" | "passerby" | "not_person" | "self";
  confidence: number;
  reviewFlags: string[];
  displayName: string;
  firstName?: string | null;
  lastName?: string | null;
  /** Assignment confidences of the mentions assigned to this person. */
  mentionConfidences: number[];
  /** The resolver asked for review explicitly. */
  resolverNeedsReview?: boolean;
  /** Matched an existing person in The Network. */
  existingPersonId?: string | null;
};

export type PolicyResult = {
  status: "approved" | "rejected" | "proposed";
  needsReview: boolean;
  rule: "auto_approve" | "auto_reject" | "review";
  why: string;
};

export const AUTO_APPROVE_MIN = 0.85;
export const AUTO_REJECT_MIN = 0.8;
export const CONSISTENT_MENTION_MIN = 0.7;

export function hasFullName(p: Pick<PolicyInput, "displayName" | "firstName" | "lastName">) {
  return (!!p.firstName && !!p.lastName) || isFullName(p.displayName);
}

export function decidePolicy(p: PolicyInput): PolicyResult {
  const flags = p.reviewFlags.filter(Boolean);
  if (p.disposition === "person") {
    const consistent = p.mentionConfidences.filter((c) => c >= CONSISTENT_MENTION_MIN).length;
    const strongIdentity = hasFullName(p) || consistent >= 2;
    if (!p.resolverNeedsReview && p.confidence >= AUTO_APPROVE_MIN && flags.length === 0 && strongIdentity) {
      return { status: "approved", needsReview: false, rule: "auto_approve", why: hasFullName(p) ? "full name, confident" : `${consistent} consistent mentions` };
    }
    const why = [
      p.resolverNeedsReview && "resolver asked for review",
      p.confidence < AUTO_APPROVE_MIN && `confidence ${p.confidence.toFixed(2)}`,
      flags.length && `flags: ${flags.join(", ")}`,
      !strongIdentity && "first name only with <2 consistent mentions",
    ]
      .filter(Boolean)
      .join("; ");
    return { status: "proposed", needsReview: true, rule: "review", why };
  }
  // passerby / not_person / self: auto-reject (still listed under "Rejected" for a glance).
  if (!p.resolverNeedsReview && p.confidence >= AUTO_REJECT_MIN && flags.length === 0) {
    return { status: "rejected", needsReview: false, rule: "auto_reject", why: `${p.disposition}, confident` };
  }
  return { status: "proposed", needsReview: true, rule: "review", why: `${p.disposition} at ${p.confidence.toFixed(2)}${flags.length ? `; flags: ${flags.join(", ")}` : ""}` };
}
