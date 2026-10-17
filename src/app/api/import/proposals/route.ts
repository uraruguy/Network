import { HttpError, withOwner } from "@/lib/api-server";
import { db } from "@/lib/db";
import { listProposals, REVIEW_TABS, type ReviewTab } from "@/lib/data/import-review";
import { sourceParam } from "../_lib/http";

/** 20 proposals per page with evidence snippets and similar-person suggestions. */
export const GET = withOwner(async ({ ownerId, url }) => {
  const tab = (url.searchParams.get("tab") ?? "review") as ReviewTab;
  if (!REVIEW_TABS.includes(tab)) throw new HttpError(422, `tab must be one of ${REVIEW_TABS.join(", ")}`);
  return listProposals(db, ownerId, sourceParam(url), tab, url.searchParams.get("cursor"));
});
