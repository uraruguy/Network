import { NotePage } from "@/components/notes/NotePage";

export default async function Page({ params }: PageProps<"/people/[id]/notes/[noteId]">) {
  const { id, noteId } = await params;
  return <NotePage personId={id} noteId={noteId} />;
}
