/**
 * Client-safe twin of `normalizeRecoveryCode` in src/lib/data/passkeys.ts (server-only): lets the
 * form check the length before a round trip. The server normalises again — this is UX only.
 */
export function normalizeRecoveryCodeInput(code: string): string {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, "");
}
