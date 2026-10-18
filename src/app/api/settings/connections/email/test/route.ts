import { HttpError, withOwner } from "@/lib/api-server";
import { testEmailConnection } from "@/lib/connections/email-test";
import { getProfile } from "@/lib/data/profile";
import { clientEnv } from "@/lib/env";

export const maxDuration = 60;

/** Sends a test e-mail to the owner's own address via the active transport → {ok, to, latencyMs, error?}. */
export const POST = withOwner(async ({ ownerId, owner }) => {
  const to = (await getProfile(ownerId))?.email ?? owner.claims.email;
  if (!to) throw new HttpError(422, "Your account has no e-mail address to send the test to.");
  return testEmailConnection(ownerId, to, clientEnv.NEXT_PUBLIC_APP_URL);
}, { fresh: true });
