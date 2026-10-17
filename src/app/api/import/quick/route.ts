import { HttpError, parseBody, withOwner } from "@/lib/api-server";
import { aiConfigured } from "@/lib/ai/provider";
import { quickExtract } from "@/lib/data/import-quick";
import { importCall } from "../_lib/http";
import { quickExtractInput } from "./schema";

export const maxDuration = 120;

/** Paste → AI extraction → people with match suggestions (nothing is written). */
export const POST = withOwner(async ({ ownerId, req }) => {
  const body = await parseBody(req, quickExtractInput);
  if (!aiConfigured()) throw new HttpError(400, "AI isn’t configured — add an API key to the environment");
  return importCall(() => quickExtract(ownerId, body));
});
