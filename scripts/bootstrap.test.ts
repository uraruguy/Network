import { describe, expect, it } from "vitest";
import {
  envValues,
  formatEntry,
  isLocalUrl,
  mergeEnv,
  missingSecrets,
  parseEnvFile,
  parseOptions,
  parseStatusJson,
  supabaseEnvFromStatus,
  unquote,
  weakSecrets,
} from "./bootstrap";

describe("parseEnvFile / envValues", () => {
  it("reads entries like dotenv: quotes, export, inline comments, last one wins", () => {
    const text = ['# comment', 'A=1', 'export B="two words"', "C='x # not a comment'", "D=plain # trailing", "A=2", "  # E=commented", ""].join("\n");
    const values = envValues(text);
    expect(Object.fromEntries(values)).toEqual({ A: "2", B: "two words", C: "x # not a comment", D: "plain" });
    expect(values.has("E")).toBe(false);
    expect(parseEnvFile(text).map((l) => l.kind)).toEqual(["other", "entry", "entry", "entry", "entry", "entry", "other"]);
  });

  it("keeps = inside values and treats an empty file as no lines", () => {
    expect(envValues("URL=postgres://u:p@h/db?x=1").get("URL")).toBe("postgres://u:p@h/db?x=1");
    expect(parseEnvFile("")).toEqual([]);
    expect(unquote('  ""  ')).toBe("");
  });
});

describe("mergeEnv", () => {
  it("appends missing keys under a header and preserves everything else verbatim", () => {
    const before = "# mine\nKEEP=yes\n\n# AI\nOPENROUTER_API_KEY=abc # note\n";
    const r = mergeEnv(before, { KEEP: "no", NEW_ONE: "v1", NEW_TWO: "v2" }, "# Added");
    expect(r.kept).toEqual(["KEEP"]);
    expect(r.added).toEqual(["NEW_ONE", "NEW_TWO"]);
    expect(r.filled).toEqual([]);
    expect(r.text).toBe(before + "\n# Added\nNEW_ONE=v1\nNEW_TWO=v2\n");
  });

  it("fills empty values in place instead of appending a duplicate", () => {
    const before = 'APP_SECRET=\nCRON_SECRET=""\nOTHER=1';
    const r = mergeEnv(before, { APP_SECRET: "s1", CRON_SECRET: "s2" });
    expect(r.filled).toEqual(["APP_SECRET", "CRON_SECRET"]);
    expect(r.added).toEqual([]);
    expect(r.text).toBe("APP_SECRET=s1\nCRON_SECRET=s2\nOTHER=1\n");
  });

  it("treats a commented-out key as missing", () => {
    const r = mergeEnv("# AUTH_REQUIRE_PASSKEY=false\n", { AUTH_REQUIRE_PASSKEY: "true" }, "# Added");
    expect(r.added).toEqual(["AUTH_REQUIRE_PASSKEY"]);
    expect(r.text).toBe("# AUTH_REQUIRE_PASSKEY=false\n\n# Added\nAUTH_REQUIRE_PASSKEY=true\n");
  });

  it("only looks at the last occurrence of a key", () => {
    expect(mergeEnv("A=1\nA=\n", { A: "x" }).text).toBe("A=1\nA=x\n");
    expect(mergeEnv("A=\nA=1\n", { A: "x" }).kept).toEqual(["A"]);
  });

  it("creates a file from nothing", () => {
    const r = mergeEnv("", { A: "1" }, "# Added");
    expect(r.text).toBe("# Added\nA=1\n");
  });

  it("is idempotent: a second run changes nothing", () => {
    const first = mergeEnv("X=1\nAPP_SECRET=\n", { APP_SECRET: "a", CRON_SECRET: "b" });
    const second = mergeEnv(first.text, { APP_SECRET: "other", CRON_SECRET: "other" });
    expect(second.text).toBe(first.text);
    expect(second.added).toEqual([]);
    expect(second.filled).toEqual([]);
    expect(second.kept).toEqual(["APP_SECRET", "CRON_SECRET"]);
  });

  it("returns the input untouched when nothing changes (even without a trailing newline)", () => {
    expect(mergeEnv("A=1", { A: "2" }).text).toBe("A=1");
  });

  it("keeps CRLF line endings", () => {
    expect(mergeEnv("A=1\r\n", { B: "2" }, "# Added").text).toBe("A=1\r\n\r\n# Added\r\nB=2\r\n");
  });

  it("quotes values dotenv would misread", () => {
    expect(formatEntry("K", "abc-123_./:@+=")).toBe("K=abc-123_./:@+=");
    expect(formatEntry("K", 'a b#"c')).toBe('K="a b#\\"c"');
    const r = mergeEnv("", { K: "The Network <a@b.c>" });
    expect(envValues(r.text).get("K")).toBe("The Network <a@b.c>");
  });
});

describe("secrets", () => {
  const rand = (n: number) => Buffer.alloc(n, 7);

  it("generates only missing or empty secrets, long enough for validation", () => {
    const out = missingSecrets(new Map([["CRON_SECRET", "already-set-and-long"], ["INBOX_TOKEN", ""]]), rand);
    expect(Object.keys(out).sort()).toEqual(["APP_SECRET", "INBOX_TOKEN"]);
    expect(out.APP_SECRET!.length).toBeGreaterThanOrEqual(32);
    expect(out.APP_SECRET).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(out.INBOX_TOKEN).toMatch(/^[0-9a-f]{48}$/);
  });

  it("uses real randomness by default", () => {
    expect(missingSecrets(new Map()).APP_SECRET).not.toBe(missingSecrets(new Map()).APP_SECRET);
  });

  it("flags secrets that are set but too short", () => {
    expect(weakSecrets(new Map([["APP_SECRET", "short"], ["CRON_SECRET", "x".repeat(16)]]))).toEqual(["APP_SECRET"]);
  });
});

describe("local Supabase", () => {
  const status = {
    API_URL: "http://127.0.0.1:54321",
    DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    ANON_KEY: "anon-jwt",
    PUBLISHABLE_KEY: "sb_publishable_x",
    SERVICE_ROLE_KEY: "service-jwt",
    SECRET_KEY: "sb_secret_x",
  };

  it("maps status keys to the app's variables (legacy JWT keys first)", () => {
    expect(supabaseEnvFromStatus(status)).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-jwt",
      SUPABASE_SERVICE_ROLE_KEY: "service-jwt",
      DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    });
    expect(supabaseEnvFromStatus({ API_URL: "http://127.0.0.1:54321", PUBLISHABLE_KEY: "p", SECRET_KEY: "s" })).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "p",
      SUPABASE_SERVICE_ROLE_KEY: "s",
    });
  });

  it("parses status JSON surrounded by CLI noise", () => {
    expect(parseStatusJson(`Stopped services: []\n${JSON.stringify(status)}\nA new version is available`)).toEqual(status);
    expect(parseStatusJson("not running")).toBeNull();
    expect(parseStatusJson("{broken")).toBeNull();
    expect(parseStatusJson("[1]")).toBeNull();
  });

  it("recognises only loopback URLs as local", () => {
    for (const u of ["http://127.0.0.1:54321", "http://localhost:54321", "http://[::1]:54321"]) expect(isLocalUrl(u)).toBe(true);
    for (const u of ["https://abc.supabase.co", "http://127.0.0.1.nip.io", "http://localhost.evil.com", "not a url", undefined]) expect(isLocalUrl(u)).toBe(false);
  });
});

describe("parseOptions", () => {
  it("parses flags and refuses unknown ones", () => {
    expect(parseOptions(["--env", "/tmp/x.env", "--email=a@b.c", "--no-owner", "-y"])).toMatchObject({ envFile: "/tmp/x.env", email: "a@b.c", owner: false, yes: true, supabase: true });
    expect(parseOptions(["--help"])).toBe("help");
    expect(() => parseOptions(["--password", "hunter2"])).toThrow(/Unknown option/);
    expect(() => parseOptions(["--env"])).toThrow(/needs a value/);
  });
});
