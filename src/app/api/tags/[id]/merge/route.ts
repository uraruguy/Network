import { HttpError, notFound, parseBody, withOwner } from "@/lib/api-server";
import { mergeTags } from "@/lib/data/tags";
import { tagMerge } from "@/lib/schemas";

/** POST {intoId} — moves everyone from this tag onto `intoId`, deletes this tag → the target TagRow. */
export const POST = withOwner<{ id: string }>(async ({ ownerId, params, req }) => {
  const result = await mergeTags(ownerId, params.id, (await parseBody(req, tagMerge)).intoId);
  if (result.status === "ok") return result.tag;
  if (result.status === "conflict") throw new HttpError(409, result.message);
  notFound();
});
