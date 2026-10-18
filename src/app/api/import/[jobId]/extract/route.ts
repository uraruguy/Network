import { withOwner } from "@/lib/api-server";
import { extractNext } from "@/lib/data/import";
import { withOwnerAi } from "../../_lib/http";

export const maxDuration = 120;

export const POST = withOwner<{ jobId: string }>(async ({ ownerId, params }) => withOwnerAi(ownerId, () => extractNext(ownerId, params.jobId)));
