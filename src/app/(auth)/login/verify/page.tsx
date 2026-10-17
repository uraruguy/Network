import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getOwner } from "@/lib/auth/server";
import { safeNext } from "@/lib/auth/redirect";
import { countCredentials } from "@/lib/data/passkeys";
import { clientEnv } from "@/lib/env";
import { biometricFor, detectPlatform } from "@/lib/security/platform";
import { VerifyFlow } from "./VerifyFlow";

export const metadata: Metadata = { title: "Confirm it's you" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Passkey step (2 of 2). The proxy only lets password-signed-in sessions through and skips this
 * page once a passkey is proven. With no passkey enrolled yet, it becomes the first-run enrollment.
 */
export default async function VerifyPage({ searchParams }: Props) {
  await connection();
  const owner = await getOwner();
  if (!owner) redirect("/login");
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : null, clientEnv.NEXT_PUBLIC_APP_URL);
  const hasPasskeys = (await countCredentials(owner.id)) > 0;
  // First-paint wording from the User-Agent; the client refines it with real capability checks.
  const initialBiometric = biometricFor(detectPlatform((await headers()).get("user-agent") ?? ""), true);
  return <VerifyFlow hasPasskeys={hasPasskeys} email={owner.claims.email} next={next} initialBiometric={initialBiometric} />;
}
