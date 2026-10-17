import { z } from "zod";
import { HttpError, parseBody, withOwner } from "@/lib/api-server";
import { getAiConnectionView, saveAiConnection, UI_AI_PROVIDERS } from "@/lib/connections/ai";
import { managedByEnv, withSecretErrors } from "../../_lib/errors";

const model = z.string().trim().max(200).regex(/^[\w./:@-]*$/, "Unexpected characters in model id").nullish();
const body = z.object({
  provider: z.enum(UI_AI_PROVIDERS),
  /** Write-only. Omit to keep the stored key, "" to clear it. */
  apiKey: z.string().trim().max(500).nullish(),
  mainModel: model,
  fastModel: model,
});

/** → AiConnectionView (secrets never leave the server; only `secretHint`). */
export const GET = withOwner(async ({ ownerId }) => getAiConnectionView(ownerId));

/** Save the AI connection (409 when the environment manages it) → AiConnectionView. */
export const PUT = withOwner(async ({ ownerId, req }) => {
  const input = await parseBody(req, body);
  const current = await getAiConnectionView(ownerId);
  if (current.source === "env") managedByEnv(current.envVars);
  if (input.provider !== "off") {
    const keepsKey = input.apiKey === undefined && current.storedProvider === input.provider && current.hasSecret;
    if (!input.apiKey && !keepsKey) throw new HttpError(422, "Add an API key for this provider.", "api_key_required");
  }
  await withSecretErrors(() => saveAiConnection(ownerId, { ...input, apiKey: input.apiKey === null ? "" : input.apiKey }));
  return getAiConnectionView(ownerId);
});
