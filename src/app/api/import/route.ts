import { z } from "zod";
import { withOwner, parseBody, HttpError } from "@/lib/api-server";
import { aiConfigured } from "@/lib/ai/provider";
import { createImportJob, exportRow, listJobs } from "@/lib/data/import";

export const GET = withOwner(async ({ ownerId }) => ({ jobs: await listJobs(ownerId), aiConfigured: aiConfigured() }));

export const POST = withOwner(async ({ ownerId, req }) => {
  const body = await parseBody(req, z.object({ rows: z.array(exportRow).min(1).max(5000), label: z.string().optional() }));
  if (!aiConfigured()) throw new HttpError(400, "OPENROUTER_API_KEY is not configured");
  return createImportJob(ownerId, body.rows, body.label);
});
