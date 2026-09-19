import { Suspense } from "react";
import { GlobeView } from "@/components/globe/GlobeView";

export const metadata = { title: "Globe" };

export default function GlobePage() {
  return (
    <Suspense>
      <GlobeView />
    </Suspense>
  );
}
