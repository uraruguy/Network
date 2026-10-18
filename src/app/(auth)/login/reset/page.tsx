import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getOwner } from "@/lib/auth/server";
import { ResetForm } from "./ResetForm";

export const metadata: Metadata = { title: "New password" };

/** How long after opening the e-mailed link the form stays available (seconds). */
const RESET_WINDOW_S = 3600;

/** True when the session proved the mailbox (reset link) within the window. */
function recentEmailProof(proof: number | null | undefined): boolean {
  return !!proof && Date.now() / 1000 - proof <= RESET_WINDOW_S;
}

/**
 * Choose a new password after an e-mailed reset link (/auth/callback signed the browser in).
 * Only a session that proved the mailbox recently (`amr` recovery/otp) gets the form: a session
 * from the password alone must not be able to change it and sign the owner out everywhere.
 * The proxy sends sessionless visitors back to /login. The passkey step still follows.
 */
export default async function ResetPage() {
  await connection();
  const owner = await getOwner();
  if (!owner || !recentEmailProof(owner.claims.emailProofAt)) redirect("/login?error=reset");
  return <ResetForm email={owner.claims.email} />;
}
