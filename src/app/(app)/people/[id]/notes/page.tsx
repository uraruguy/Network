import { PersonNotesPage } from "@/components/notes/PersonNotesPage";

/** All of one person's notes (the same section the person page shows, on its own). */
export default async function Page({ params }: PageProps<"/people/[id]/notes">) {
  const { id } = await params;
  return <PersonNotesPage personId={id} />;
}
