import { Suspense } from "react";
import { PersonDetail } from "@/components/people/PersonDetail";

export const metadata = { title: "Person" };

/**
 * Client-rendered on purpose: the profile reads the offline cache first (instant, works without a
 * network) and the API re-verifies the session. `useSearchParams` (?reminder=1) needs Suspense.
 */
export default async function PersonPage({ params }: PageProps<"/people/[id]">) {
  const { id } = await params;
  return (
    <Suspense>
      <PersonDetail key={id} id={id} />
    </Suspense>
  );
}
