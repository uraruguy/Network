import { ImportJob } from "@/components/import/ImportJob";

export default async function ImportJobPage({ params }: PageProps<"/import/[jobId]">) {
  const { jobId } = await params;
  return <ImportJob jobId={jobId} />;
}
