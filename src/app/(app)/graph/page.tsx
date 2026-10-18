import { Suspense } from "react";
import { GraphView } from "@/components/graph/GraphView";

export const metadata = { title: "Graph" };

export default function GraphPage() {
  return (
    <Suspense>
      <GraphView />
    </Suspense>
  );
}
