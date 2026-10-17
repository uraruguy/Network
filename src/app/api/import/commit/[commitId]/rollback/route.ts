import { z } from "zod";
import { HttpError, parseBody, withOwner } from "@/lib/api-server";
import { db } from "@/lib/db";
import { rollbackImport } from "@/lib/data/import-commit";
import { importCall } from "../../../_lib/http";

export const maxDuration = 300;

const body = z.object({ dryRun: z.boolean().default(true), force: z.boolean().default(false) });

/** Reverts one commit from import_commit_log (dry run by default). */
export const POST = withOwner<{ commitId: string }>(async ({ ownerId, params, req }) => {
  if (!z.string().uuid().safeParse(params.commitId).success) throw new HttpError(422, "Invalid commit id");
  const b = await parseBody(req, body);
  return importCall(() => rollbackImport(db, ownerId, { commitId: params.commitId, dryRun: b.dryRun, force: b.force }));
});
