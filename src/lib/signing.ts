import { createHmac, timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";

function secret() {
  const s = serverEnv().CRON_SECRET;
  if (!s) throw new Error("CRON_SECRET is not set");
  return s;
}

/** Signs an action so it can be executed from an email link without a session. */
export function signAction(parts: string[], ttlSeconds = 60 * 60 * 24 * 30) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = [...parts, String(exp)].join(":");
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return { exp, sig };
}

export function verifyAction(parts: string[], exp: number, sig: string) {
  if (!exp || exp < Math.floor(Date.now() / 1000)) return false;
  const expected = createHmac("sha256", secret()).update([...parts, String(exp)].join(":")).digest("base64url");
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function actionUrl(base: string, reminderId: string, action: "done" | "snooze" | "open") {
  if (action === "open") return `${base}/today`;
  const { exp, sig } = signAction([reminderId, action]);
  return `${base}/api/reminders/${reminderId}/${action}?exp=${exp}&sig=${sig}`;
}
