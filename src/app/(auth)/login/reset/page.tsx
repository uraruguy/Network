import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getOwner } from "@/lib/auth/server";
import { ResetForm } from "./ResetForm";

export const metadata: Metadata = { title: "New password" };

/**
 * Choose a new password after an e-mailed reset link (/auth/callback signed the browser in).
 * The proxy sends sessionless visitors back to /login. The passkey step still follows.
 */
export default async function ResetPage() {
  await connection();
  const owner = await getOwner();
  if (!owner) redirect("/login?error=reset");
  return <ResetForm email={owner.claims.email} />;
}
