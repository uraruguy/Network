import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { currentUser } from "@/lib/supabase/server";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Wraps a route handler: resolves the owner, parses JSON body, maps errors to responses. */
export function withOwner<TParams = Record<string, string>>(
  handler: (ctx: { ownerId: string; req: Request; params: TParams; url: URL }) => Promise<Response | unknown>,
) {
  return async (req: Request, ctx: { params: Promise<TParams> }) => {
    try {
      const user = await currentUser();
      if (!user) throw new HttpError(401, "Not signed in");
      const params = await ctx.params;
      const result = await handler({ ownerId: user.id, req, params, url: new URL(req.url) });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (err) {
      if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
      console.error(err);
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
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

export function notFound(): never {
  throw new HttpError(404, "Not found");
}
