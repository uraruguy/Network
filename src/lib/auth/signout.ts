"use client";
import type { QueryClient } from "@tanstack/react-query";
import { makePersister } from "@/lib/offline/queryClient";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * Deliberate sign-out: ends the session and removes every private copy this browser holds.
 *
 *   const qc = useQueryClient();
 *   <Button onClick={() => signOutEverywhere(qc)}>Sign out</Button>
 *
 * Order matters: server-side state first (passkey cookie, Supabase refresh token), then local
 * copies (in-memory queries, the IndexedDB offline cache, runtime caches), then a full
 * navigation so nothing private survives in memory. Each step is best effort — a failing network
 * call must never leave private data on the device.
 *
 * This is NOT what happens when a session merely lapses (see src/lib/api.ts): then caches stay,
 * so offline edits survive until the owner signs back in.
 */
export async function signOutEverywhere(queryClient?: QueryClient): Promise<void> {
  // 1. Passkey cookie (httpOnly — only the server can clear it).
  await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => {});
  // 2. Supabase session: revokes this device's refresh token and clears the auth cookies.
  await supabaseBrowser()
    .auth.signOut({ scope: "local" })
    .catch(() => {});
  // 3. Queries in memory (cancels in-flight fetches, drops paused offline mutations).
  queryClient?.getMutationCache().clear();
  queryClient?.clear();
  // 4. The persisted offline cache in IndexedDB. Removing the key empties it now; deleting the
  //    database also catches a throttled write the cache provider may still have in flight (it
  //    can land after the removal). The delete runs once this page's connection closes, and
  //    before the next page can open the database again.
  try {
    await makePersister().removeClient();
  } catch {}
  await deleteDatabase(OFFLINE_DB);
  // 5. Runtime caches (pages, RSC payloads, map tiles…). The Serwist precache holds only the
  //    public app shell and stays, so the next sign-in still opens fast.
  await clearRuntimeCaches().catch(() => {});
  // 6. Full navigation: drops in-memory state and history entries' bfcache.
  window.location.replace("/login");
}

/** idb-keyval's default database, where the offline query cache lives (src/lib/offline/queryClient.ts). */
const OFFLINE_DB = "keyval-store";

/** Requests deletion of an IndexedDB database; resolves at once if open connections block it. */
function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** Deletes every Cache Storage entry except Serwist's precache (`serwist-precache-v2-…`). */
export async function clearRuntimeCaches(): Promise<void> {
  if (typeof caches === "undefined") return;
  const names = await caches.keys();
  await Promise.all(names.filter((n) => !n.includes("precache")).map((n) => caches.delete(n)));
}
