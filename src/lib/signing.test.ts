import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { actionUrl, LEGACY_LINKS_ACCEPTED_UNTIL, signAction, verifyAction } from "./signing";

const ID = "3ae4df27-f2e0-42ce-a859-92f1dab46b2a";
const env = { APP_SECRET: "a".repeat(48), CRON_SECRET: "legacy-cron-secret-123" };
const NOW = Date.UTC(2026, 9, 18, 12, 0, 0);
const sec = (ms: number) => Math.floor(ms / 1000);

/** What the pre-v2 code produced: HMAC(CRON_SECRET, "id:action:exp"). */
function legacySig(parts: string[], exp: number, secret = env.CRON_SECRET) {
  return createHmac("sha256", secret).update([...parts, String(exp)].join(":")).digest("base64url");
}

describe("signAction / verifyAction", () => {
  it("round-trips with the derived link-signing key", () => {
    const { exp, sig } = signAction([ID, "done"], 3600, { now: NOW, env });
    expect(exp).toBe(sec(NOW) + 3600);
    expect(verifyAction([ID, "done"], exp, sig, { now: NOW, env })).toBe(true);
  });

  it("binds the signature to the reminder, the action and the expiry", () => {
    const { exp, sig } = signAction([ID, "done"], 3600, { now: NOW, env });
    expect(verifyAction([ID, "snooze"], exp, sig, { now: NOW, env })).toBe(false);
    expect(verifyAction(["7b4c4fd8-6a35-4c1b-9a43-0d6b1f1b1b1b", "done"], exp, sig, { now: NOW, env })).toBe(false);
    expect(verifyAction([ID, "done"], exp + 1, sig, { now: NOW, env })).toBe(false);
    expect(verifyAction([ID, "done"], exp, sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A"), { now: NOW, env })).toBe(false);
  });

  it("expires", () => {
    const { exp, sig } = signAction([ID, "done"], 60, { now: NOW, env });
    expect(verifyAction([ID, "done"], exp, sig, { now: NOW + 59_000, env })).toBe(true);
    expect(verifyAction([ID, "done"], exp, sig, { now: NOW + 61_000, env })).toBe(false);
  });

  it("is not the CRON_SECRET anymore, and rejects garbage", () => {
    const { exp, sig } = signAction([ID, "done"], 3600, { now: NOW, env });
    expect(sig).not.toBe(legacySig([ID, "done"], exp));
    expect(verifyAction([ID, "done"], exp, "", { now: NOW, env })).toBe(false);
    expect(verifyAction([ID, "done"], exp, "not base64url!!", { now: NOW, env })).toBe(false);
    expect(verifyAction([ID, "done"], Number.NaN, sig, { now: NOW, env })).toBe(false);
  });

  it("keeps verifying during an APP_SECRET rotation", () => {
    const { exp, sig } = signAction([ID, "done"], 3600, { now: NOW, env });
    const rotated = { ...env, APP_SECRET: "b".repeat(48), APP_SECRET_PREVIOUS: env.APP_SECRET };
    expect(verifyAction([ID, "done"], exp, sig, { now: NOW, env: rotated })).toBe(true);
    expect(verifyAction([ID, "done"], exp, sig, { now: NOW, env: { ...env, APP_SECRET: "b".repeat(48) } })).toBe(false);
  });
});

describe("legacy CRON_SECRET links (grace period)", () => {
  it("still verifies unexpired links e-mailed before the switch", () => {
    const exp = sec(NOW) + 20 * 86400;
    expect(verifyAction([ID, "snooze"], exp, legacySig([ID, "snooze"], exp), { now: NOW, env })).toBe(true);
  });

  it("rejects them once expired, past the cutoff, or without CRON_SECRET", () => {
    const exp = sec(NOW) + 20 * 86400;
    const sig = legacySig([ID, "snooze"], exp);
    expect(verifyAction([ID, "snooze"], exp, sig, { now: (exp + 1) * 1000, env })).toBe(false);
    expect(verifyAction([ID, "snooze"], exp, sig, { now: NOW, env: { APP_SECRET: env.APP_SECRET } })).toBe(false);
    const late = LEGACY_LINKS_ACCEPTED_UNTIL + 1;
    expect(verifyAction([ID, "snooze"], late, legacySig([ID, "snooze"], late), { now: NOW, env })).toBe(false);
    expect(verifyAction([ID, "done"], exp, sig, { now: NOW, env })).toBe(false); // other action
  });
});

describe("actionUrl", () => {
  it("points digest buttons at the confirm page, not the mutating API", () => {
    const url = new URL(actionUrl("https://network.example.com", ID, "done"));
    expect(url.pathname).toBe(`/r/${ID}/done`);
    const exp = Number(url.searchParams.get("exp"));
    expect(verifyAction([ID, "done"], exp, url.searchParams.get("sig")!)).toBe(true);
    expect(actionUrl("https://network.example.com", ID, "open")).toBe("https://network.example.com/today");
  });
});
