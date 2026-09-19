import { withOwner } from "@/lib/api-server";
import { extractNext } from "@/lib/data/import";

export const maxDuration = 120;

export const POST = withOwner<{ jobId: string }>(async ({ ownerId, params }) => extractNext(ownerId, params.jobId));
