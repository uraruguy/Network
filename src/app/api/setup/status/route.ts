import { withOwner } from "@/lib/api-server";
import { getSetupStatus } from "@/lib/connections/setup-status";

/**
 * Install readiness checklist → {items: [{id, label, state: ok|todo|warn|error, detail, href?, command?, optional?}], done, total, complete}.
 * Cheap and read-only (no outside calls).
 */
export const GET = withOwner(async ({ ownerId }) => getSetupStatus(ownerId));
