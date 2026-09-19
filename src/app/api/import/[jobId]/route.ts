import { withOwner, notFound } from "@/lib/api-server";
import { deleteJob, getJob } from "@/lib/data/import";

export const GET = withOwner<{ jobId: string }>(async ({ ownerId, params }) => (await getJob(ownerId, params.jobId)) ?? notFound());
export const DELETE = withOwner<{ jobId: string }>(async ({ ownerId, params }) => {
  await deleteJob(ownerId, params.jobId);
  return { ok: true };
});
