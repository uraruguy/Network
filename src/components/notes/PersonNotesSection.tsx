"use client";
import { NotebookPen, SquarePen } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { GlassButton } from "@/components/glass/GlassButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { Tooltip } from "@/components/ui/Tooltip";
import { useCacheReady } from "@/lib/offline/useCacheReady";
import { useNewNote } from "@/lib/queries/notes";
import { usePersonDetail, usePersonNotes } from "@/lib/queries/people";
import type { NoteSummary } from "@/lib/queries/types";
import { cn } from "@/lib/utils";
import { primeKeyboard } from "./keyboard";
import { preloadNoteEditor, usePreloadNoteEditorOnIdle } from "./loadEditor";
import { NotesList } from "./NotesList";
import { QuickNoteComposer } from "./QuickNoteComposer";

/** Notes on a person page: quick composer + Apple Notes-style grouped list. */
export type PersonNotesSectionProps = { personId: string; personName: string; className?: string };

const PAGE_SIZE = 50;

export function PersonNotesSection({ personId, personName, className }: PersonNotesSectionProps) {
  const headingId = useId();
  // Cached data only once it may render (see useCacheReady): server HTML and hydration agree.
  const cacheReady = useCacheReady();
  const detail = usePersonDetail(personId);
  const person = cacheReady ? detail.data : undefined;
  const isPending = !cacheReady || detail.isPending;
  const [expanded, setExpanded] = useState(false);
  const all = usePersonNotes(expanded ? personId : null, { pageSize: PAGE_SIZE });
  const newNote = useNewNote();
  usePreloadNoteEditorOnIdle();

  const startNote = () => {
    primeKeyboard();
    newNote(personId);
  };

  // ⌘N: new note for this person.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        newNote(personId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newNote, personId]);

  // The person page carries the newest 50 (pinned first); "Show all" pages through the rest.
  const notes = useMemo(() => {
    const byId = new Map<string, NoteSummary>();
    for (const page of (cacheReady ? all.data?.pages : undefined) ?? []) for (const n of page.items) byId.set(n.id, n);
    for (const n of person?.notes ?? []) byId.set(n.id, n);
    return [...byId.values()];
  }, [all.data, cacheReady, person?.notes]);

  const total = Math.max(person?.notesCount ?? 0, notes.length);
  const hidden = total - notes.length;
  const canLoadMore = expanded ? all.hasNextPage : hidden > 0;

  return (
    <section aria-labelledby={headingId} className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between gap-3 pl-1">
        <h2 id={headingId} className="flex items-baseline gap-2 text-title3 text-fg">
          Notes
          {total > 0 && <span className="text-subhead font-normal text-fg-3 tabular-nums">{total}</span>}
        </h2>
        <Tooltip content="New note" shortcut="⌘N">
          <IconButton label="New note" variant="accent" size="lg" icon={<SquarePen />} onPointerDown={preloadNoteEditor} onClick={startNote} />
        </Tooltip>
      </div>

      <QuickNoteComposer personId={personId} personName={personName} />

      {!person && isPending ? (
        <div className="surface overflow-hidden rounded-lg">
          <SkeletonRows count={3} avatar={false} />
        </div>
      ) : notes.length === 0 ? (
        <EmptyState
          compact
          icon={<NotebookPen />}
          title="No notes yet"
          description={`Coffees, calls, the kids’ names — what you write about ${personName.split(/\s+/)[0] || personName} stays here.`}
        />
      ) : (
        <NotesList notes={notes} personId={personId} personName={personName} />
      )}

      {canLoadMore && (
        <div className="flex justify-center">
          <GlassButton
            variant="plain"
            size="sm"
            loading={all.isFetching && expanded}
            onClick={() => (expanded ? all.fetchNextPage() : setExpanded(true))}
          >
            {expanded ? "Show more" : `Show all ${total}`}
          </GlassButton>
        </div>
      )}
    </section>
  );
}
