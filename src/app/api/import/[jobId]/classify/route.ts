import { withOwner } from "@/lib/api-server";
import { classifyNext, retryFailed } from "@/lib/data/import";

export const maxDuration = 120;

export const POST = withOwner<{ jobId: string }>(async ({ ownerId, params, url }) => {
  if (url.searchParams.get("retry")) await retryFailed(ownerId, params.jobId);
  return classifyNext(ownerId, params.jobId);
});
