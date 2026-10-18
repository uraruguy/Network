import { parseBody, withOwner } from "@/lib/api-server";
import { quickSave } from "@/lib/data/import-quick";
import { importCall } from "../../_lib/http";
import { quickSaveInput } from "../schema";

export const maxDuration = 60;

/** Saves a reviewed paste through the import commit path (one-note job, source "paste"). */
export const POST = withOwner(async ({ ownerId, req }) => {
  const body = await parseBody(req, quickSaveInput);
  return importCall(() => quickSave(ownerId, body));
});
