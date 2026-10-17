"use client";
import type { QueryClient } from "@tanstack/react-query";
import { del } from "idb-keyval";
import { CACHE_VERSION } from "@/lib/offline/queryClient";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * Signs the owner out and goes to /login.
 *
 * TODO(merge): swap the Supabase call for `signOutEverywhere()` from `@/lib/auth/signout`
 * (Security track — revokes every session and clears the passkey cookie). Until then this is the
 * local fallback: end all Supabase sessions ("global" scope), wipe the offline cache (memory +
 * IndexedDB) so nothing private stays on the device, then a full navigation to /login.
 */
export async function signOut(qc: QueryClient) {
  const supabase = supabaseBrowser();
  try {
    await supabase.auth.signOut({ scope: "global" });
  } catch {
    // Offline or already signed out: still drop the local session.
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  }
  qc.clear();
  await del(`the-network-cache-${CACHE_VERSION}`).catch(() => {});
  // A full navigation on purpose: no screen (or in-memory state) of the signed-in app survives.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/login");
}
