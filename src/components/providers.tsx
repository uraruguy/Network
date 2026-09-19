"use client";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { MotionConfig } from "motion/react";
import { useState } from "react";
import { makePersister, makeQueryClient, CACHE_VERSION } from "@/lib/offline/queryClient";
import { registerPeopleMutations } from "@/lib/queries/people";
import { registerNoteMutations } from "@/lib/queries/notes";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => {
    const qc = makeQueryClient();
    registerPeopleMutations(qc);
    registerNoteMutations(qc);
    return qc;
  });
  const [persister] = useState(makePersister);
  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{ persister, buster: CACHE_VERSION, maxAge: 1000 * 60 * 60 * 24 * 14 }}
      onSuccess={() => client.resumePausedMutations().then(() => client.invalidateQueries())}
    >
      <MotionConfig reducedMotion="user" transition={{ type: "spring", stiffness: 380, damping: 34 }}>
        {children}
      </MotionConfig>
    </PersistQueryClientProvider>
  );
}
