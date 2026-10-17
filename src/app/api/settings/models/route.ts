import { z } from "zod";
import { parseQuery, withOwner } from "@/lib/api-server";
import { listModels } from "@/lib/connections/models";

const query = z.object({ provider: z.enum(["openrouter", "anthropic"]) });

/** ?provider=openrouter|anthropic → {provider, models: [{id, name, contextLength?}], source: "live"|"fallback", error?}. Cached 1 h. */
export const GET = withOwner(async ({ ownerId, url }) => listModels(ownerId, parseQuery(url, query).provider));
