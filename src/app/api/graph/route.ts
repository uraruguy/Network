import { withOwner } from "@/lib/api-server";
import { graphData } from "@/lib/data/graph";

export const GET = withOwner(async ({ ownerId }) => graphData(ownerId));
