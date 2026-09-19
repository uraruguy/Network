import { withOwner } from "@/lib/api-server";
import { bulkCommitHighConfidence } from "@/lib/data/import";

export const maxDuration = 120;

export const POST = withOwner<{ jobId: string }>(async ({ ownerId, params }) => ({ committed: await bulkCommitHighConfidence(ownerId, params.jobId) }));
