import { NotePage } from "@/components/notes/NotePage";

export default async function Page({ params }: PageProps<"/people/[id]/notes/[noteId]">) {
  const { id, noteId } = await params;
  // Keyed by note: each note gets fresh editor + autosave state.
  return <NotePage key={noteId} personId={id} noteId={noteId} />;
}
