import { z } from "zod";
import { withOwner, parseBody } from "@/lib/api-server";
import { isIanaTimeZone } from "@/lib/ai/tools/time";
import { getProfile, updateProfile } from "@/lib/data/profile";
import { upsertLocation } from "@/lib/data/locations";
import { locationInput } from "@/lib/schemas";

const timeZone = z.string().trim().refine(isIanaTimeZone, "Unknown time zone (use an IANA name like Europe/Ljubljana)");

/** Empty bodies are fine (nothing changes). `timezone` must be an IANA zone (stats and due dates are computed in it). */
const patch = z.object({
  displayName: z.string().trim().max(100).nullish(),
  timezone: timeZone.optional(),
  digestHour: z.number().int().min(0).max(23).optional(),
  digestEnabled: z.boolean().optional(),
  homeLocation: locationInput.nullish(),
});

/** The profile as the client sees it: secrets (the Shortcut's inbox token) never leave the server. */
async function publicProfile(ownerId: string) {
  const profile = await getProfile(ownerId);
  if (!profile) return null;
  const { inboxToken: _secret, ...rest } = profile;
  return rest;
}

export const GET = withOwner(async ({ ownerId }) => publicProfile(ownerId));
export const PATCH = withOwner(async ({ ownerId, req }) => {
  const { homeLocation, ...rest } = await parseBody(req, patch);
  const values: Parameters<typeof updateProfile>[1] = { ...rest };
  if (homeLocation !== undefined) values.homeLocationId = homeLocation ? (await upsertLocation(ownerId, homeLocation)).id : null;
  await updateProfile(ownerId, values);
  return publicProfile(ownerId);
});
