import { z } from "zod";
import { withOwner, parseBody } from "@/lib/api-server";
import { applyInbox, dismissInbox, triageInbox } from "@/lib/data/inbox";

export const maxDuration = 60;

export const POST = withOwner<{ id: string }>(async ({ ownerId, params, req }) => {
  const b = await parseBody(req, z.object({ action: z.enum(["triage", "apply", "dismiss"]), primaryIndex: z.number().int().optional() }));
  if (b.action === "triage") return triageInbox(ownerId, params.id);
  if (b.action === "apply") return applyInbox(ownerId, params.id, b.primaryIndex ?? 0);
  await dismissInbox(ownerId, params.id);
  return { ok: true };
});
