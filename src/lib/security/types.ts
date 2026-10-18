/** JSON shapes of the /api/security endpoints (shared by route handlers and the Settings UI). */

export type PasskeyInfo = {
  id: string;
  name: string | null;
  /** "singleDevice" | "multiDevice" (synced, e.g. iCloud Keychain). */
  deviceType: string | null;
  backedUp: boolean;
  transports: string[];
  createdAt: string;
  lastUsedAt: string | null;
};

export type SecurityOverview = {
  passkeys: PasskeyInfo[];
  recoveryCodesLeft: number;
  /** Deployment requires the passkey step (AUTH_REQUIRE_PASSKEY ≠ "false"). */
  passkeyRequired: boolean;
  /** This session proved a passkey (or recovery code) — needed to change passkeys and codes. */
  mfaVerified: boolean;
};

export type EnrollResult = { ok: true; credential: PasskeyInfo; recoveryCodes?: string[] };
