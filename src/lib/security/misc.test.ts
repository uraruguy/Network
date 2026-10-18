import { describe, expect, it } from "vitest";
import { parseReports } from "./csp-report";
import { passwordProblem } from "./password";
import { biometricFor, detectPlatform, deviceName } from "./platform";
import { createRateLimiter } from "./rate-limit";
import { normalizeRecoveryCodeInput } from "./recovery-code";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

describe("createRateLimiter", () => {
  it("allows `limit` hits per window and key", () => {
    const rl = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect([rl.hit("a", 0), rl.hit("a", 10), rl.hit("a", 20)]).toEqual([true, true, false]);
    expect(rl.hit("b", 20)).toBe(true);
    expect(rl.hit("a", 1000)).toBe(true); // new window
  });

  it("bounds memory by evicting the oldest keys", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 2 });
    rl.hit("a", 0);
    rl.hit("b", 0);
    rl.hit("c", 0); // evicts "a"
    expect(rl.hit("a", 1)).toBe(true);
    expect(rl.hit("c", 1)).toBe(false);
  });
});

describe("parseReports", () => {
  it("normalises legacy report-uri bodies and scrubs URLs", () => {
    const [v] = parseReports({
      "csp-report": {
        "document-uri": "https://app.example.com/r/abc/done?exp=1&sig=SECRET",
        "blocked-uri": "inline",
        "effective-directive": "script-src-elem",
        disposition: "report",
        "script-sample": "x".repeat(200),
      },
    });
    expect(v).toEqual({ documentURL: "https://app.example.com/r/abc/done", blockedURL: "inline", effectiveDirective: "script-src-elem", disposition: "report", sourceFile: undefined, lineNumber: undefined, sample: "x".repeat(40) });
  });

  it("reads Reporting API batches and ignores everything else", () => {
    const out = parseReports([
      { type: "csp-violation", body: { documentURL: "https://app.example.com/login#x", blockedURL: "https://evil.example/x.js?q=1", effectiveDirective: "script-src", lineNumber: 3 } },
      { type: "deprecation", body: { id: "x" } },
      "junk",
    ]);
    expect(out).toEqual([{ documentURL: "https://app.example.com/login", blockedURL: "https://evil.example/x.js", effectiveDirective: "script-src", disposition: undefined, sourceFile: undefined, lineNumber: 3, sample: undefined }]);
    expect(parseReports(null)).toEqual([]);
    expect(parseReports({ foo: 1 })).toEqual([]);
    expect(parseReports(Array.from({ length: 50 }, () => ({ type: "csp-violation", body: {} })))).toHaveLength(20);
  });
});

describe("passwordProblem", () => {
  it("requires 12+ characters with letters and digits", () => {
    expect(passwordProblem("short1")).toMatch(/12/);
    expect(passwordProblem("onlyletterslong")).toMatch(/letters and numbers/);
    expect(passwordProblem("123456789012")).toMatch(/letters and numbers/);
    expect(passwordProblem("correct horse 42")).toBeNull();
    expect(passwordProblem("žabaŽABA1234")).toBeNull();
    expect(passwordProblem("a1".repeat(65))).toMatch(/at most/);
  });
});

describe("platform wording", () => {
  it("detects Apple devices from the user agent", () => {
    expect(detectPlatform(IPHONE)).toBe("iphone");
    expect(detectPlatform(MAC)).toBe("mac");
    expect(detectPlatform(MAC, 5)).toBe("ipad"); // iPadOS desktop-class UA
    expect(detectPlatform("Mozilla/5.0 (Linux; Android 15)")).toBe("android");
    expect(detectPlatform("")).toBe("other");
  });

  it("names the biometric only when a platform authenticator exists", () => {
    expect(biometricFor("iphone", true)).toBe("Face ID");
    expect(biometricFor("mac", true)).toBe("Touch ID");
    expect(biometricFor("mac", false)).toBe("passkey");
    expect(biometricFor("ipad", true)).toBe("passkey");
    expect(deviceName("iphone")).toBe("iPhone");
  });
});

describe("normalizeRecoveryCodeInput", () => {
  it("ignores case and separators", () => {
    expect(normalizeRecoveryCodeInput(" abcd-efgh jkmn ")).toBe("ABCDEFGHJKMN");
  });
});
