import "server-only";
import { NextResponse } from "next/server";
import { z, type ZodType } from "zod";
import { getOwner, type Owner } from "@/lib/auth/server";

/**
 * Route-handler plumbing: authentication, parameter/body validation and one JSON error shape.
 *
 *   Error body: { error: <machine code>, message: <human text> }
 *   Codes: unauthenticated · mfa_required · forbidden · not_found · gone · conflict · invalid ·
 *          bad_request · rate_limited · internal
 */

const DEFAULT_CODES: Record<number, string> = {
  400: "bad_request",
  401: "unauthenticated",
  403: "forbidden",
  404: "not_found",
  409: "conflict",
  410: "gone",
  422: "invalid",
  429: "rate_limited",
  500: "internal",
};

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string = DEFAULT_CODES[status] ?? "error",
  ) {
    super(message);
  }
}

/** Owner data is private and per-user: never cache it in shared caches or the browser's HTTP cache. */
export const NO_STORE = "private, no-store";

export function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ error: code, message }, { status, headers: { "cache-control": NO_STORE } });
}

function errorResponse(err: unknown) {
  if (err instanceof HttpError) return jsonError(err.status, err.code, err.message);
  console.error(err);
  return jsonError(500, "internal", "Internal error");
}

/** Route params named `id` or `…Id` are UUIDs everywhere in this app. */
const ID_PARAM = /^(id|[a-zA-Z]+Id)$/;
const uuid = z.string().uuid();

function validateParams<T>(raw: Record<string, string>, schema?: ZodType<T>): T {
  if (schema) {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new HttpError(404, "Not found");
    return parsed.data;
  }
  for (const [key, value] of Object.entries(raw)) {
    if (ID_PARAM.test(key) && !uuid.safeParse(value).success) throw new HttpError(404, "Not found");
  }
  return raw as T;
}

export type OwnerContext<TParams> = { ownerId: string; owner: Owner; req: Request; params: TParams; url: URL };

/**
 * Wraps a route handler: re-verifies the session (local JWT check + passkey cookie — the proxy is
 * not the only gate), validates route params (malformed ids → 404), maps errors to JSON and marks
 * responses `Cache-Control: private, no-store`. Return a value to send it as JSON, or a Response.
 */
export function withOwner<TParams = Record<string, string>>(
  handler: (ctx: OwnerContext<TParams>) => Promise<Response | unknown>,
  opts: { params?: ZodType<TParams> } = {},
) {
  return async (req: Request, ctx: { params: Promise<TParams> }) => {
    try {
      const owner = await getOwner();
      if (!owner) throw new HttpError(401, "Not signed in", "unauthenticated");
      if (!owner.mfaSatisfied) throw new HttpError(401, "Passkey verification required", "mfa_required");
      const raw = ((await ctx?.params) ?? {}) as Record<string, string>;
      const params = validateParams<TParams>(raw, opts.params);
      const result = await handler({ ownerId: owner.id, owner, req, params, url: new URL(req.url) });
      const res = result instanceof Response ? result : NextResponse.json(result ?? { ok: true });
      try {
        if (!res.headers.has("cache-control")) res.headers.set("cache-control", NO_STORE);
      } catch {
        // Immutable headers (e.g. Response.redirect): leave as is.
      }
      return res;
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
  const result = schema.safeParse(json);
  if (!result.success) throw new HttpError(422, result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return result.data;
}

/** Parses query-string parameters (repeated keys and comma lists become arrays where the schema wants them). */
export function parseQuery<T>(url: URL, schema: ZodType<T>): T {
  const obj: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const all = url.searchParams.getAll(key);
    obj[key] = all.length > 1 ? all : all[0]!;
  }
  const result = schema.safeParse(obj);
  if (!result.success) throw new HttpError(400, result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return result.data;
}

export function notFound(): never {
  throw new HttpError(404, "Not found");
}
