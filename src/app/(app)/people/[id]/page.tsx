import { Suspense } from "react";
import { PersonDetail } from "@/components/people/PersonDetail";

export default async function PersonPage({ params }: PageProps<"/people/[id]">) {
  const { id } = await params;
  return (
    <Suspense>
      <PersonDetail id={id} />
    </Suspense>
  );
}
