import { withOwner, parseBody } from "@/lib/api-server";
import { aggregatePeople, commitByPeople, peopleDecisionSchema } from "@/lib/data/import";
import { z } from "zod";

export const maxDuration = 120;

export const GET = withOwner<{ jobId: string }>(async ({ ownerId, params }) => aggregatePeople(ownerId, params.jobId));

export const POST = withOwner<{ jobId: string }>(async ({ ownerId, params, req }) => {
  const { decisions } = await parseBody(req, z.object({ decisions: peopleDecisionSchema }));
  return commitByPeople(ownerId, params.jobId, decisions);
});
