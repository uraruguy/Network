import { z } from "zod";
import { withOwner, parseBody, HttpError } from "@/lib/api-server";
import { createImportJob, exportRow, listJobs } from "@/lib/data/import";
import { ownerAiConfigured } from "./_lib/http";

export const GET = withOwner(async ({ ownerId }) => ({ jobs: await listJobs(ownerId), aiConfigured: await ownerAiConfigured(ownerId) }));

export const POST = withOwner(async ({ ownerId, req }) => {
  const body = await parseBody(req, z.object({ rows: z.array(exportRow).min(1).max(5000), label: z.string().optional() }));
  if (!(await ownerAiConfigured(ownerId))) throw new HttpError(400, "AI isn’t configured — connect a provider in Settings → AI & e-mail");
  return createImportJob(ownerId, body.rows, body.label);
});
