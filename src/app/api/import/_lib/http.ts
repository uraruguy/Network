import { HttpError } from "@/lib/api-server";
import { ImportError } from "@/lib/data/import-shared";

export const SOURCES = ["apple-notes"] as const;

/** Runs an import data call, mapping ImportError (status + message) to the route's HttpError. */
export async function importCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ImportError) throw new HttpError(e.status, e.message);
    throw e;
  }
}

export function sourceParam(url: URL) {
  const s = url.searchParams.get("source") ?? "apple-notes";
  if (!/^[a-z0-9-]{1,40}$/.test(s)) throw new HttpError(422, "Invalid source");
  return s;
}
