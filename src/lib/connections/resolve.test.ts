import { describe, expect, it } from "vitest";
import { aiConfigFromEnv, aiConfigFromStored, DEFAULT_AI_MODELS, resolveAiConfig } from "./ai";
import { emailConfigFromEnv, emailConfigFromStored, redactSmtpUrl, resolveEmailConfig } from "./email";
import { fingerprint, statusFor } from "./store";
import { smtpOptions } from "@/lib/email/smtp";
import { htmlToText } from "@/lib/email/text";

const row = (provider: string, config: Record<string, unknown> = {}, secret: string | null = null) => ({ provider, config, secret });

describe("AI connection resolution", () => {
  it("reads the environment like the v1 provider switch", () => {
    expect(aiConfigFromEnv({})).toBeNull();
    expect(aiConfigFromEnv({ OPENROUTER_API_KEY: "sk-or-1" })).toEqual({
      provider: "openrouter",
      apiKey: "sk-or-1",
      mainModel: DEFAULT_AI_MODELS.openrouter.main,
      fastModel: DEFAULT_AI_MODELS.openrouter.fast,
      source: "env",
    });
    expect(aiConfigFromEnv({ ANTHROPIC_API_KEY: "sk-ant", OPENROUTER_API_KEY: "sk-or" })?.provider).toBe("anthropic");
    expect(aiConfigFromEnv({ AI_PROVIDER: "openrouter", ANTHROPIC_API_KEY: "sk-ant", OPENROUTER_API_KEY: "sk-or" })?.provider).toBe("openrouter");
    // Forced provider without its key falls through to the key that exists.
    expect(aiConfigFromEnv({ AI_PROVIDER: "anthropic", OPENROUTER_API_KEY: "sk-or" })?.provider).toBe("openrouter");
    expect(aiConfigFromEnv({ AI_PROVIDER: "agent-sdk" })).toMatchObject({ provider: "agent-sdk", mainModel: "sonnet", source: "env" });
    expect(aiConfigFromEnv({ AI_PROVIDER: "agent-sdk" })?.apiKey).toBeUndefined();
  });

  it("uses model overrides from the environment and ignores empty values", () => {
    expect(aiConfigFromEnv({ OPENROUTER_API_KEY: "k", OPENROUTER_MODEL: "anthropic/x" })?.mainModel).toBe("anthropic/x");
    expect(aiConfigFromEnv({ OPENROUTER_API_KEY: "k", OPENROUTER_MODEL: "anthropic/x", AI_MODEL_MAIN: "anthropic/y", AI_MODEL_FAST: "anthropic/z" })).toMatchObject({
      mainModel: "anthropic/y",
      fastModel: "anthropic/z",
    });
    expect(aiConfigFromEnv({ ANTHROPIC_API_KEY: "  ", OPENROUTER_API_KEY: "" })).toBeNull();
  });

  it("reads stored rows; a provider without a key is off", () => {
    expect(aiConfigFromStored(null)).toBeNull();
    expect(aiConfigFromStored(row("anthropic", { mainModel: "claude-opus-5-5" }, "sk-ant-x"))).toEqual({
      provider: "anthropic",
      apiKey: "sk-ant-x",
      mainModel: "claude-opus-5-5",
      fastModel: DEFAULT_AI_MODELS.anthropic.fast,
      source: "db",
    });
    expect(aiConfigFromStored(row("openrouter", {}, null))).toMatchObject({ provider: "off", source: "db" });
    expect(aiConfigFromStored(row("off"))).toMatchObject({ provider: "off", source: "db" });
  });

  it("environment wins over the database; nothing configured means off", () => {
    const env = aiConfigFromEnv({ OPENROUTER_API_KEY: "env-key" });
    const db = aiConfigFromStored(row("anthropic", {}, "db-key"));
    expect(resolveAiConfig(env, db)).toMatchObject({ provider: "openrouter", apiKey: "env-key", source: "env" });
    expect(resolveAiConfig(null, db)).toMatchObject({ provider: "anthropic", apiKey: "db-key", source: "db" });
    expect(resolveAiConfig(null, null)).toMatchObject({ provider: "off", source: "db" });
  });
});

describe("e-mail connection resolution", () => {
  it("prefers SMTP_URL, then RESEND_API_KEY, with EMAIL_FROM", () => {
    expect(emailConfigFromEnv({})).toBeNull();
    expect(emailConfigFromEnv({ RESEND_API_KEY: "re_1", EMAIL_FROM: "Me <me@x.io>" })).toEqual({ provider: "resend", apiKey: "re_1", from: "Me <me@x.io>", source: "env" });
    expect(emailConfigFromEnv({ RESEND_API_KEY: "re_1", SMTP_URL: "smtp://localhost:1025" })).toMatchObject({ provider: "smtp", smtp: { url: "smtp://localhost:1025" } });
  });

  it("reads stored SMTP and Resend rows; incomplete settings are off", () => {
    expect(emailConfigFromStored(row("smtp", { host: "smtp.x.io", port: 587, user: "u", from: "a@x.io" }, "pw"), {})).toEqual({
      provider: "smtp",
      from: "a@x.io",
      smtp: { host: "smtp.x.io", port: 587, secure: false, user: "u", pass: "pw" },
      source: "db",
    });
    // Unauthenticated SMTP (e.g. a local catcher) needs no password.
    expect(emailConfigFromStored(row("smtp", { host: "127.0.0.1", port: 1025 }), {})).toMatchObject({ provider: "smtp", smtp: { host: "127.0.0.1", port: 1025 } });
    expect(emailConfigFromStored(row("smtp", {}), {})).toMatchObject({ provider: "off" });
    expect(emailConfigFromStored(row("resend", {}, null), {})).toMatchObject({ provider: "off" });
    expect(emailConfigFromStored(row("resend", {}, "re_x"), { EMAIL_FROM: "env@x.io" })).toMatchObject({ provider: "resend", from: "env@x.io" });
  });

  it("environment wins over the database", () => {
    const env = emailConfigFromEnv({ RESEND_API_KEY: "re_env" });
    const db = emailConfigFromStored(row("smtp", { host: "h" }), {});
    expect(resolveEmailConfig(env, db, {})).toMatchObject({ provider: "resend", source: "env" });
    expect(resolveEmailConfig(null, db, {})).toMatchObject({ provider: "smtp", source: "db" });
    expect(resolveEmailConfig(null, null, {})).toMatchObject({ provider: "off", source: "db" });
  });

  it("builds nodemailer options and redacts URLs", () => {
    expect(smtpOptions({ host: "h", port: 465 })).toMatchObject({ host: "h", port: 465, secure: true });
    expect(smtpOptions({ host: "h" })).toMatchObject({ port: 587, secure: false });
    expect(smtpOptions({ host: "h", user: "u", pass: "p" })).toMatchObject({ auth: { user: "u", pass: "p" } });
    expect(smtpOptions({ url: "smtp://a:b@h:25" })).toMatchObject({ url: "smtp://a:b@h:25" });
    expect(redactSmtpUrl("smtps://user:secret@mail.x.io:465")).toBe("smtps://user:****@mail.x.io:465");
  });
});

describe("verification status", () => {
  const fp = fingerprint(["ai", "db", "anthropic", "key"], { APP_SECRET: "s".repeat(40) });

  it("only counts a test of the settings that are active now", () => {
    const check = { at: "2026-10-18T00:00:00Z", ok: true, source: "db" as const, fingerprint: fp };
    expect(statusFor({ configured: true, source: "db", fingerprint: fp }, check)).toBe("verified");
    expect(statusFor({ configured: true, source: "db", fingerprint: fp }, { ...check, ok: false })).toBe("error");
    expect(statusFor({ configured: true, source: "db", fingerprint: "other" }, check)).toBe("untested");
    expect(statusFor({ configured: true, source: "env", fingerprint: fp }, check)).toBe("untested");
    expect(statusFor({ configured: false, source: "db", fingerprint: fp }, check)).toBe("off");
  });

  it("fingerprints change with the secret and don't contain it", () => {
    const env = { APP_SECRET: "s".repeat(40) };
    expect(fingerprint(["a", "key1"], env)).not.toBe(fingerprint(["a", "key2"], env));
    expect(fingerprint(["a", "key1"], env)).not.toContain("key1");
  });
});

describe("htmlToText", () => {
  it("keeps link targets and line structure", () => {
    const html = `<html><head><style>p{}</style></head><body><p>Hi &amp; welcome</p><a href="https://x.io/done">Done ✓</a><br>Bye</body></html>`;
    expect(htmlToText(html)).toBe("Hi & welcome\nDone ✓ (https://x.io/done)\nBye");
  });
});
