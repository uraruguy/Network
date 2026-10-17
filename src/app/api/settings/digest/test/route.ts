import { withOwner } from "@/lib/api-server";
import { sendDigestPreview } from "@/lib/data/digest";

export const maxDuration = 60;

/** E-mails today's digest to the owner as a preview (doesn't count as today's digest) → {ok, to, error?}. */
export const POST = withOwner(async ({ ownerId }) => sendDigestPreview(ownerId));
