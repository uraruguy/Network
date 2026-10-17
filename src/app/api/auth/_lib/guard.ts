import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { NO_STORE, jsonError } from "@/lib/api-server";
import { getOwner, type Owner } from "@/lib/auth/server";
import { CHALLENGE_COOKIE, challengeCookieOptions } from "@/lib/auth/webauthn";
import { clientEnv } from "@/lib/env";
import { HttpError } from "@/lib/errors";

/**
 * Plumbing for the sign-in endpoints under /api/auth. These run before the passkey is proven
 * (route class `mfa-step`), so they can't use `withOwner`, which requires it.
 */

const ALLOWED_ORIGINS = () => new Set([originOf(clientEnv.NEXT_PUBLIC_APP_URL)]);

function originOf(url: string): string {
  return new URL(url).origin;
}

/**
 * The origin the browser addressed (Host / X-Forwarded-Host as set by the platform). A
 * cross-site page can't change these on the victim's request, which makes them a sound
 * reference for the Origin check — and the right WebAuthn origin in development.
 */
export function requestOrigin(req: Request): string {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host") || url.host;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || url.protocol.replace(":", "");
  try {
    return new URL(`${proto}://${host}`).origin;
  } catch {
    return url.origin;
  }
}

/**
 * CSRF defense in depth (on top of SameSite cookies and JSON bodies): state-changing requests
 * must come from our own pages. Browsers always send `Origin` on POST.
 */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) throw new HttpError(403, "Missing origin", "forbidden");
  const allowed = ALLOWED_ORIGINS();
  allowed.add(requestOrigin(req));
  if (!allowed.has(origin)) throw new HttpError(403, "Cross-origin request refused", "forbidden");
}

/** The password-signed-in caller (passkey not necessarily proven yet). */
export async function requireSession(): Promise<Owner> {
  const owner = await getOwner();
  if (!owner) throw new HttpError(401, "Not signed in", "unauthenticated");
  return owner;
}

/**
 * Expected WebAuthn origin. Production pins NEXT_PUBLIC_APP_URL (never the Host header);
 * development follows the request so any local port works.
 */
export function rpOrigin(req: Request): string | undefined {
  return process.env.NODE_ENV === "development" ? requestOrigin(req) : undefined;
}

export async function readJson<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > 64 * 1024) throw new HttpError(413, "Body too large", "bad_request");
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new HttpError(422, "Invalid request");
  return parsed.data;
}

/** Wraps a handler: JSON errors in the app's `{ error, message }` shape, never cached. */
export function authRoute(handler: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    try {
      const res = await handler(req);
      if (!res.headers.has("cache-control")) res.headers.set("cache-control", NO_STORE);
      return res;
    } catch (err) {
      if (err instanceof HttpError) return jsonError(err.status, err.code, err.message);
      console.error(err);
      return jsonError(500, "internal", "Internal error");
    }
  };
}

/**
 * Expires the WebAuthn challenge cookie. `__Host-` cookies only accept a Set-Cookie with Secure
 * and Path=/, so `cookies().delete()` (which omits Secure) would be silently ignored.
 */
export function clearChallengeCookie(jar: { set(name: string, value: string, options: typeof challengeCookieOptions): unknown }) {
  jar.set(CHALLENGE_COOKIE, "", { ...challengeCookieOptions, maxAge: 0 });
}

export const ok = <T extends object>(body: T) => NextResponse.json(body, { headers: { "cache-control": NO_STORE } });

/** Shape check for SimpleWebAuthn's browser output; full verification happens in the library. */
export const credentialResponse = z
  .object({
    id: z.string().min(1).max(1024),
    rawId: z.string().min(1).max(1024),
    type: z.literal("public-key"),
    response: z.record(z.string(), z.unknown()),
    clientExtensionResults: z.record(z.string(), z.unknown()).default({}),
    authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
  })
  .passthrough();
