"use client";
import type { QueryClient } from "@tanstack/react-query";
import { signOutEverywhere } from "@/lib/auth/signout";

/** Signs the owner out of this device and removes every private copy it holds (see signOutEverywhere). */
export function signOut(qc: QueryClient) {
  return signOutEverywhere(qc);
}
