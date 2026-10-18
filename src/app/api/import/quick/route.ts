import { parseBody, withOwner } from "@/lib/api-server";
import { quickExtract } from "@/lib/data/import-quick";
import { importCall, withOwnerAi } from "../_lib/http";
import { quickExtractInput } from "./schema";

export const maxDuration = 120;

/** Paste → AI extraction → people with match suggestions (nothing is written). */
export const POST = withOwner(async ({ ownerId, req }) => {
  const body = await parseBody(req, quickExtractInput);
  return importCall(() => withOwnerAi(ownerId, () => quickExtract(ownerId, body)));
});
