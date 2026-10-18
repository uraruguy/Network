"use client";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { MotionConfig } from "motion/react";
import { useEffect, useState } from "react";
import { flushPersistedCache, makePersistOptions, makeQueryClient } from "@/lib/offline/queryClient";
import { registerChatMutations } from "@/lib/queries/chat";
import { registerInboxMutations } from "@/lib/queries/inbox";
import { registerNoteMutations } from "@/lib/queries/notes";
import { registerPeopleMutations } from "@/lib/queries/people";
import { registerSettingsMutations } from "@/lib/queries/settings";
import { spring } from "@/lib/motion";
import { ThemeSync } from "@/components/shell/ThemeSync";
import { ConfirmHost } from "@/components/ui/ConfirmDialog";
import { ToastHost } from "@/components/ui/Toast";

/**
 * App-wide client providers. The query cache is restored from IndexedDB on start; until that
 * finishes `useIsRestoring()` is true and queries don't fetch, so the server render and the
 * first client render agree (both show skeletons — see components/skeletons).
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => {
    const qc = makeQueryClient();
    // Mutation defaults first, so paused offline writes restored from IndexedDB know how to resume.
    registerPeopleMutations(qc);
    registerNoteMutations(qc);
    registerInboxMutations(qc);
    registerSettingsMutations(qc);
    registerChatMutations(qc);
    return qc;
  });
  const [persistOptions] = useState(makePersistOptions);

  // The page may be killed once it's hidden: put queued writes on disk now, not after the throttle.
  useEffect(() => {
    const flush = () => void flushPersistedCache();
    const onVisibility = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={persistOptions}
      onSuccess={() => client.resumePausedMutations().then(() => client.invalidateQueries())}
    >
      <MotionConfig reducedMotion="user" transition={spring.smooth}>
        <ThemeSync />
        {children}
        <ToastHost />
        <ConfirmHost />
      </MotionConfig>
    </PersistQueryClientProvider>
  );
}
