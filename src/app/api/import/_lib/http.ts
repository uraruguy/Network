import { HttpError } from "@/lib/api-server";
import { withImportAi } from "@/lib/ai/provider";
import { getAiConfig } from "@/lib/connections/ai";
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

/** Whether the owner has an AI connection: the environment first, then Settings → AI & e-mail (as chat). */
export async function ownerAiConfigured(ownerId: string) {
  return (await getAiConfig(ownerId)).provider !== "off";
}

/**
 * Runs AI import work (extraction, triage, classification) on the owner's AI connection, so a key
 * saved in Settings works without environment variables. 400 when there is no connection at all.
 */
export async function withOwnerAi<T>(ownerId: string, fn: () => Promise<T>): Promise<T> {
  const config = await getAiConfig(ownerId);
  if (config.provider === "off") throw new HttpError(400, "AI isn’t configured — connect a provider in Settings → AI & e-mail");
  return withImportAi(config, fn);
}

export function sourceParam(url: URL) {
  const s = url.searchParams.get("source") ?? "apple-notes";
  if (!/^[a-z0-9-]{1,40}$/.test(s)) throw new HttpError(422, "Invalid source");
  return s;
}
