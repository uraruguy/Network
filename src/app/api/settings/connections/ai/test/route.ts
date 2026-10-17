import { withOwner } from "@/lib/api-server";
import { testAiConnection } from "@/lib/connections/ai-test";

export const maxDuration = 60;

/** 1-token request to the active provider's main model → {ok, latencyMs, model, error?}. */
export const POST = withOwner(async ({ ownerId }) => testAiConnection(ownerId));
