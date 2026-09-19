import { z } from "zod";
import { withOwner, parseBody } from "@/lib/api-server";
import { getProfile, updateProfile } from "@/lib/data/profile";
import { upsertLocation } from "@/lib/data/locations";
import { locationInput } from "@/lib/schemas";

const patch = z.object({
  displayName: z.string().trim().max(100).nullish(),
  timezone: z.string().optional(),
  digestHour: z.number().int().min(0).max(23).optional(),
  digestEnabled: z.boolean().optional(),
  homeLocation: locationInput.nullish(),
});

export const GET = withOwner(async ({ ownerId }) => getProfile(ownerId));
export const PATCH = withOwner(async ({ ownerId, req }) => {
  const { homeLocation, ...rest } = await parseBody(req, patch);
  const values: Parameters<typeof updateProfile>[1] = { ...rest };
  if (homeLocation !== undefined) values.homeLocationId = homeLocation ? (await upsertLocation(ownerId, homeLocation)).id : null;
  await updateProfile(ownerId, values);
  return getProfile(ownerId);
});
