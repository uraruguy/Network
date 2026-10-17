import { withOwner } from "@/lib/api-server";
import { db } from "@/lib/db";
import { listCommits } from "@/lib/data/import-commit";
import { reviewStats } from "@/lib/data/import-review";
import { sourceParam } from "../_lib/http";

/** Counts only: items by status, dismissed reasons, proposals by status, unassigned mentions, commits. */
export const GET = withOwner(async ({ ownerId, url }) => {
  const source = sourceParam(url);
  const [stats, commits] = await Promise.all([reviewStats(db, ownerId, source), listCommits(db, ownerId, source)]);
  return { ...stats, commits: commits.slice(0, 10) };
});
