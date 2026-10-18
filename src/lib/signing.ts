import { createHmac, timingSafeEqual } from "node:crypto";
import { deriveKey, verificationKeys } from "@/lib/crypto/keys";

/**
 * Signed, expiring links for actions taken from an e-mail without a session (digest "Done" /
 * "Snooze a week"). The link opens a confirm page (/r/<id>/<action>) — opening it never changes
 * anything, so mail scanners that prefetch links are harmless — and the page POSTs back to
 * /api/reminders/<id>/<action>, which verifies the signature again before acting.
 *
 *   sig = base64url(HMAC-SHA256(key, JSON.stringify([...parts, exp])))
 *   key = HKDF(APP_SECRET, "network:link-signing:v1")   (APP_SECRET_PREVIOUS accepted during rotation)
 *
 * Transition: links e-mailed before this scheme were signed with CRON_SECRET over
 * `parts.join(":") + ":" + exp`. They keep working until they expire (30 days after sending), and
 * never past LEGACY_LINKS_ACCEPTED_UNTIL — delete the legacy branch after that date.
 */

const PURPOSE = "link-signing";
export const LINK_TTL_SECONDS = 60 * 60 * 24 * 30;

/** Unix seconds. Legacy (CRON_SECRET) signatures with a later expiry are rejected outright. */
export const LEGACY_LINKS_ACCEPTED_UNTIL = Math.floor(Date.UTC(2027, 0, 31) / 1000);

type Env = Record<string, string | undefined>;
type Opts = { now?: number; env?: Env };

const payload = (parts: string[], exp: number) => JSON.stringify([...parts, exp]);
const mac = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data).digest("base64url");

function equal(expected: string, given: Buffer) {
  const e = Buffer.from(expected);
  return e.length === given.length && timingSafeEqual(e, given);
}

/** Signs an action so it can be confirmed from an e-mail link without a session. */
export function signAction(parts: string[], ttlSeconds = LINK_TTL_SECONDS, opts: Opts = {}) {
  const exp = Math.floor((opts.now ?? Date.now()) / 1000) + ttlSeconds;
  const sig = mac(deriveKey(PURPOSE, opts.env), payload(parts, exp));
  return { exp, sig };
}

/** True if `sig` is a valid, unexpired signature for `parts` (current scheme or legacy grace). */
export function verifyAction(parts: string[], exp: number, sig: string, opts: Opts = {}) {
  const env = opts.env ?? process.env;
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  if (!Number.isSafeInteger(exp) || exp < now) return false;
  if (typeof sig !== "string" || !/^[A-Za-z0-9_-]{20,100}$/.test(sig)) return false;
  const given = Buffer.from(sig);

  let keys: Buffer[] = [];
  try {
    keys = verificationKeys(PURPOSE, env);
  } catch {
    // No APP_SECRET: only legacy links can verify.
  }
  if (keys.some((key) => equal(mac(key, payload(parts, exp)), given))) return true;

  const legacySecret = env.CRON_SECRET;
  if (legacySecret && exp <= LEGACY_LINKS_ACCEPTED_UNTIL) {
    return equal(mac(legacySecret, [...parts, String(exp)].join(":")), given);
  }
  return false;
}

/** Link for a digest button. "open" is a plain app link; the others go through the confirm page. */
export function actionUrl(base: string, reminderId: string, action: "done" | "snooze" | "open") {
  if (action === "open") return `${base}/today`;
  const { exp, sig } = signAction([reminderId, action]);
  return `${base}/r/${reminderId}/${action}?exp=${exp}&sig=${sig}`;
}
