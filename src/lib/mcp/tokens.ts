import { createHmac, randomBytes } from "node:crypto";
import type { Scope } from "@/lib/ai/tools/registry";

/**
 * Personal access tokens (PATs) for MCP clients that can't do OAuth (Claude Code, Cursor, scripts).
 *
 *   token  = "ntk_" + base62(32 random bytes)            → 47 chars, shown to the owner once
 *   stored = HMAC-SHA256(deriveKey("pat-pepper"), token)  → hex; a database leak alone can't be replayed
 *
 * Pure (no I/O); unit-tested.
 */

export const PAT_PREFIX = "ntk_";
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
/** 32 bytes need 43 base62 digits (62^43 > 2^256). */
const BODY_LENGTH = 43;
export const PAT_PATTERN = /^ntk_[0-9A-Za-z]{43}$/;

// BigInt() calls rather than literals: the TS target (ES2017) predates `0n`.
const ZERO = BigInt(0);
const RADIX = BigInt(62);

export function base62(bytes: Uint8Array): string {
  let n = BigInt(`0x${Buffer.from(bytes).toString("hex") || "0"}`);
  let out = "";
  while (n > ZERO) {
    out = ALPHABET[Number(n % RADIX)] + out;
    n /= RADIX;
  }
  return out || "0";
}

export function generateToken(random: (size: number) => Uint8Array = randomBytes): string {
  return PAT_PREFIX + base62(random(32)).padStart(BODY_LENGTH, "0");
}

export const looksLikePat = (token: string) => token.startsWith(PAT_PREFIX);

export function hashToken(token: string, key: Uint8Array): string {
  return createHmac("sha256", key).update(token, "utf8").digest("hex");
}

/** What the UI shows to recognise a token later ("ntk_8fK2…"). */
export const tokenPrefix = (token: string) => token.slice(0, PAT_PREFIX.length + 6);

/* ------------------------------------------------------------------ */
/*  Scopes                                                              */
/* ------------------------------------------------------------------ */

export type Access = "read" | "write";

export const scopesFor = (access: Access): Scope[] => (access === "write" ? ["network:read", "network:write"] : ["network:read"]);

/** Known scopes only, de-duplicated; `network:write` implies `network:read`. */
export function normalizeScopes(raw: readonly string[] | null | undefined): Scope[] {
  const set = new Set((raw ?? []).filter((s): s is Scope => s === "network:read" || s === "network:write"));
  if (set.has("network:write")) set.add("network:read");
  return (["network:read", "network:write"] as const).filter((s) => set.has(s));
}

export const accessOf = (scopes: readonly string[]): Access => (scopes.includes("network:write") ? "write" : "read");
