import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { ReviewScreen } from "@/components/import/review/ReviewScreen";
import { sourceLabel } from "@/components/import/review/text";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCE = /^[a-z0-9-]{1,40}$/;

export async function generateMetadata({ params }: PageProps<"/import/[source]">) {
  const { source } = await params;
  return { title: SOURCE.test(source) ? `Review · ${sourceLabel(source)}` : "Import" };
}

/** Review screen for one import source; old /import/<jobId> links land on Apple Notes. */
export default async function ImportSourcePage({ params }: PageProps<"/import/[source]">) {
  const { source } = await params;
  if (UUID.test(source)) redirect("/import/apple-notes");
  if (!SOURCE.test(source)) notFound();
  return (
    <Suspense>
      <ReviewScreen source={source} />
    </Suspense>
  );
}
