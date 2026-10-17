/**
 * Tiny fixed-window rate limiter, in memory per server instance.
 *
 * Best effort by design: on serverless each instance counts on its own, so this caps noise and
 * brute force per instance rather than enforcing an exact global limit. Good enough for the CSP
 * report sink and for slowing down recovery-code guessing (whose search space — 30^12 — is the
 * real protection). Memory is bounded: the oldest keys are evicted beyond `maxKeys`.
 */
export type RateLimiter = {
  /** Counts one hit for `key`; true while the key is within its limit. */
  hit(key: string, now?: number): boolean;
  /** Forget everything (tests). */
  reset(): void;
};

export function createRateLimiter({ limit, windowMs, maxKeys = 10_000 }: { limit: number; windowMs: number; maxKeys?: number }): RateLimiter {
  const windows = new Map<string, { start: number; count: number }>();
  return {
    hit(key, now = Date.now()) {
      let w = windows.get(key);
      if (!w || now - w.start >= windowMs) {
        windows.delete(key); // re-insert at the end so Map order stays oldest-first
        w = { start: now, count: 0 };
        windows.set(key, w);
        if (windows.size > maxKeys) windows.delete(windows.keys().next().value!);
      }
      w.count++;
      return w.count <= limit;
    },
    reset() {
      windows.clear();
    },
  };
}

/** Best-effort client address for rate-limit keys (Vercel sets x-forwarded-for; never trusted for auth). */
export function clientKey(headers: Headers): string {
  return headers.get("x-real-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}
