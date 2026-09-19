import { withOwner } from "@/lib/api-server";
import { globeData } from "@/lib/data/people";

export const GET = withOwner(async ({ ownerId }) => globeData(ownerId));
