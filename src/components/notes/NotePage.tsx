"use client";
import { onlineManager, useIsMutating, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, Bell, CalendarClock, ChevronLeft, CloudOff, MoreHorizontal, Pin, PinOff, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { FollowUpSheet } from "@/components/followups/FollowUpSheet";
import { GlassButton } from "@/components/glass/GlassButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { Menu, type MenuItem } from "@/components/ui/Menu";
import { SkeletonText } from "@/components/ui/Skeleton";
import { Spinner } from "@/components/ui/Spinner";
import { toast } from "@/components/ui/Toast";
import { Tooltip } from "@/components/ui/Tooltip";
import type { NoteKind } from "@/lib/constants";
import { isWriteForNote, type NoteDoc } from "@/lib/notes/cache";
import { formatNoteLongDate } from "@/lib/notes/grouping";
import { displayTitle, isBlankContent } from "@/lib/notes/title";
import { useNoteAutosave } from "@/lib/notes/useNoteAutosave";
import { useCacheReady, useReadyData } from "@/lib/offline/useCacheReady";
import { keys } from "@/lib/queries/keys";
import { deleteNote, restoreNote, saveNote, useNewNote, useNoteDoc } from "@/lib/queries/notes";
import { usePersonDetail } from "@/lib/queries/people";
import { cn } from "@/lib/utils";
import { isNoteKind, KIND_META } from "./kinds";
import { useNoteEditorModule } from "./loadEditor";
import { MovePersonSheet } from "./MovePersonSheet";
import type { NoteEditorApi } from "./NoteEditor";
import { NoteDetails } from "./NoteDetails";

const subscribeOnline = (cb: () => void) => onlineManager.subscribe(cb);
const useOnline = () => useSyncExternalStore(subscribeOnline, () => onlineManager.isOnline(), () => true);

/** Shows nothing normally; "Offline" when offline, "Saving…" when a save has been pending > 2s. */
function SaveIndicator({ noteId }: { noteId: string }) {
  const pending = useIsMutating({ predicate: (m) => isWriteForNote(m, noteId) }) > 0;
  const online = useOnline();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setSlow(true), 2000);
    return () => {
      clearTimeout(t);
      setSlow(false);
    };
  }, [pending]);

  if (!online)
    return (
      <span role="status" className="inline-flex items-center gap-1.5 px-2 text-footnote text-fg-3">
        <CloudOff size={15} aria-hidden />
        <span className="hidden sm:inline">{pending ? "Saved on this device" : "Offline"}</span>
      </span>
    );
  if (pending && slow)
    return (
      <span role="status" className="inline-flex items-center gap-1.5 px-2 text-footnote text-fg-3">
        <Spinner size={14} />
        <span className="hidden sm:inline">Saving…</span>
      </span>
    );
  return null;
}

/** Paper while loading — same geometry as the note, so nothing jumps when it arrives. */
function PaperSkeleton() {
  return (
    <div className="min-h-[55dvh] space-y-5 pt-4 sm:min-h-[60dvh]" aria-busy>
      <div className="ui-skeleton ui-skeleton-reveal h-7 w-2/3 rounded-xs" />
      <SkeletonText lines={5} />
    </div>
  );
}

/**
 * A note, full screen: paper on phones, a centred sheet (≤720px) on desktop. Navigation bar with
 * the person (back), follow-up bell and a ⋯ menu; the date line opens Type & Date.
 */
export function NotePage({ personId: routePersonId, noteId }: { personId: string; noteId: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  // Cached data only once it may render (see useCacheReady): the server HTML and the hydration
  // render then agree on the skeleton. Client-side navigations have it straight away.
  const cacheReady = useCacheReady();
  const docQuery = useNoteDoc(noteId, { personId: routePersonId });
  const doc = cacheReady ? docQuery.data : undefined;
  const isPending = !cacheReady || docQuery.isPending;
  const isError = cacheReady && docQuery.isError;
  const { refetch } = docQuery;
  const personId = doc?.personId ?? routePersonId;
  const person = useReadyData(usePersonDetail(personId));
  const EditorModule = useNoteEditorModule();
  const newNote = useNewNote();
  const online = useOnline();

  const api = useRef<NoteEditorApi | null>(null);
  const [toolbarSlot, setToolbarSlot] = useState<HTMLElement | null>(null);
  const [removing, setRemoving] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [followUp, setFollowUp] = useState<{ title: string; noteId: string | null } | null>(null);
  // Unsaved drafts open with the caret in them (Title line, or the end of carried-over text).
  const [isNew] = useState(() => !!doc?.localOnly);

  // Set once a refused save forked this note into a copy (see below): nothing more is saved here.
  const forked = useRef(false);

  const deleted = !!doc?.deleted;
  const autosave = useNoteAutosave({
    noteId,
    personId,
    read: () => (api.current && !api.current.editor.isDestroyed && !forked.current ? api.current.read() : null),
    disabled: deleted || removing,
  });

  const backHref = `/people/${personId}`;
  const personName = person?.displayName ?? "Back";

  const remove = useCallback(() => {
    autosave.flush(); // the newest words go in before the delete, so Undo brings them back
    setRemoving(true);
    deleteNote(qc, { id: noteId, personId }, { onUndo: () => router.push(`/people/${personId}/notes/${noteId}`) });
    router.replace(backHref, { transitionTypes: ["nav-back"] });
  }, [autosave, qc, noteId, personId, router, backHref]);

  const openFollowUp = () => {
    autosave.flush();
    const content = api.current?.read();
    setFollowUp({ title: content?.title ?? displayTitle(doc ?? {}), noteId: autosave.isPersisted() ? noteId : null });
  };

  const move = (to: { id: string; displayName: string }) => {
    autosave.flush();
    autosave.saveMeta({ personId: to.id });
    toast.success(`Moved to ${to.displayName}`);
    router.replace(`/people/${to.id}/notes/${noteId}`);
  };

  // ⌘N: another note for this person. ⌘⌫ (outside the text): delete this one. Capture phase, so
  // this runs before the shell's ⌘N (New person), which skips handled events.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        newNote(personId);
      } else if (e.key === "Backspace" && !api.current?.editor.isFocused) {
        const t = e.target as HTMLElement | null;
        if (t?.closest("input, textarea, [contenteditable='true']")) return;
        e.preventDefault();
        remove();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [newNote, personId, remove]);

  // Another device's newer version replaces what the editor opened with (the cached copy), as
  // long as nothing typed here is unsaved — then the next save is refused and both are kept.
  useEffect(() => {
    if (doc) autosave.serverDoc(doc, api.current);
  }, [autosave, doc]);

  // That refused save kept the local words as a new note: continue there (it shows exactly what
  // was typed here, including the last unsaved keystrokes); the other version stays in this note.
  const forkedTo = doc?.forkedTo;
  useEffect(() => {
    if (!forkedTo || forked.current) return;
    const words = api.current && !api.current.editor.isDestroyed ? api.current.read() : null;
    forked.current = true;
    qc.setQueryData<NoteDoc>(keys.note(noteId), (p) => (p ? { ...p, forkedTo: undefined } : p));
    const copy = qc.getQueryData<NoteDoc>(keys.note(forkedTo));
    if (words && copy && copy.contentText !== words.text) {
      saveNote(qc, forkedTo, { personId: copy.personId, title: words.title, contentJson: words.json, contentMd: words.md, contentText: words.text, baseVersions: copy.baseVersions }, { content: true });
    }
    toast({
      title: "Edited on another device",
      description: "Your changes are kept in this copy. The other version is still there.",
      duration: 8000,
      action: { label: "Show Other", onClick: () => router.push(`/people/${personId}/notes/${noteId}`) },
    });
    router.replace(`/people/${copy?.personId ?? personId}/notes/${forkedTo}`);
  }, [forkedTo, noteId, personId, qc, router]);

  const occurredAt = doc ? new Date(doc.occurredAt) : new Date();
  const kind: NoteKind = doc && isNoteKind(doc.kind) ? doc.kind : "note";

  const menuItems: MenuItem[] = [
    { label: doc?.pinned ? "Unpin" : "Pin", icon: doc?.pinned ? <PinOff /> : <Pin />, onSelect: () => autosave.saveMeta({ pinned: !doc?.pinned }) },
    { label: "Type & Date…", icon: <CalendarClock />, onSelect: () => setDetailsOpen(true) },
    { label: "Follow Up…", icon: <Bell />, onSelect: openFollowUp },
    { label: "Move to Person…", icon: <ArrowRightLeft />, onSelect: () => setMoveOpen(true) },
    "separator",
    { label: "Delete Note", icon: <Trash2 />, destructive: true, shortcut: "⌘⌫", onSelect: remove },
  ];

  return (
    <div
      className={cn(
        // Phone: full-bleed paper under the app chrome. Desktop: a centred sheet.
        "-mx-4 -mt-[calc(12px+var(--sat))] min-h-dvh bg-surface-solid",
        "sm:mx-auto sm:mt-0 sm:min-h-0 sm:max-w-[720px] sm:rounded-xl sm:border-[0.5px] sm:border-hairline sm:shadow-e2",
      )}
    >
      <header
        className={cn(
          "sticky top-0 z-20 flex h-[calc(52px+var(--sat))] items-center gap-1 px-1.5 pt-[var(--sat)] sm:h-14 sm:rounded-t-xl sm:px-3 sm:pt-0",
          "bg-[color-mix(in_oklab,var(--surface-solid)_86%,transparent)] backdrop-blur-xl backdrop-saturate-150",
        )}
      >
        <Link
          href={backHref}
          transitionTypes={["nav-back"]}
          className="pressable inline-flex h-11 min-w-0 shrink items-center gap-0.5 rounded-full pr-3 pl-1 text-body text-accent-text hover:bg-accent-soft"
        >
          <ChevronLeft size={26} strokeWidth={2.2} className="shrink-0" aria-hidden />
          <span className="truncate">{personName}</span>
        </Link>
        <div ref={setToolbarSlot} className="flex min-w-0 flex-1 justify-center" />
        <SaveIndicator noteId={noteId} />
        <Tooltip content="Follow up">
          <IconButton label="Follow up" variant="accent" size="lg" icon={<Bell />} onClick={openFollowUp} disabled={!doc || deleted} />
        </Tooltip>
        <Menu
          title={doc ? displayTitle(doc) : undefined}
          items={menuItems}
          trigger={<IconButton label="More" variant="accent" size="lg" icon={<MoreHorizontal />} disabled={!doc || deleted} />}
        />
      </header>

      <div className="px-5 pb-6 sm:px-14 sm:pb-10">
        {doc && (
          <NoteDetails
            open={detailsOpen}
            onOpenChange={setDetailsOpen}
            kind={kind}
            occurredAt={occurredAt}
            onKind={(k) => autosave.saveMeta({ kind: k })}
            onOccurredAt={(iso) => autosave.saveMeta({ occurredAt: iso })}
            trigger={
              <button
                type="button"
                disabled={deleted}
                className="pressable mx-auto mt-1 mb-3 flex min-h-11 items-center gap-1.5 rounded-full px-3 text-footnote text-fg-3 hover:bg-fill-1 hover:text-fg-2"
              >
                {kind !== "note" && <span aria-hidden className="text-fg-3">{KIND_META[kind].icon(14)}</span>}
                <time dateTime={occurredAt.toISOString()}>{formatNoteLongDate(occurredAt)}</time>
                {kind !== "note" && <span>· {KIND_META[kind].label}</span>}
                {doc.pinned && <Pin size={13} className="text-fg-4" aria-label="Pinned" />}
              </button>
            }
          />
        )}

        {deleted && (
          <div role="alert" className="mb-4 flex items-center gap-3 rounded-md bg-fill-1 py-2 pr-2 pl-4">
            <p className="min-w-0 flex-1 text-subhead text-fg-2">This note was deleted.</p>
            <GlassButton
              size="sm"
              variant="soft"
              onClick={() => {
                // The editor's words come back with it; a blank editor brings back the last saved words.
                const content = api.current && !api.current.editor.isDestroyed ? api.current.read() : null;
                const body = content && !isBlankContent({ title: content.title, contentText: content.text }) ? { title: content.title, contentJson: content.json, contentMd: content.md, contentText: content.text } : undefined;
                restoreNote(qc, noteId, personId, body);
              }}
            >
              <RotateCcw size={15} aria-hidden /> Restore
            </GlassButton>
          </div>
        )}

        {!doc && isPending && <PaperSkeleton />}
        {!doc && isError && (
          <EmptyState
            compact
            title={online ? "Couldn’t open this note" : "You’re offline"}
            description={online ? "Something went wrong loading it." : "This note isn’t on this device yet. It opens when you’re back online."}
            action={
              <GlassButton size="sm" variant="soft" onClick={() => refetch()}>
                Try again
              </GlassButton>
            }
          />
        )}
        {doc &&
          (EditorModule ? (
            <EditorModule.NoteEditor
              note={doc}
              autoFocus={isNew}
              editable={!deleted}
              toolbarSlot={toolbarSlot}
              onReady={(a) => {
                api.current = a;
                autosave.ready(a.read(), a.source);
                if (doc) autosave.serverDoc(doc, a);
              }}
              onChange={autosave.changed}
            />
          ) : (
            <PaperSkeleton />
          ))}
      </div>

      <MovePersonSheet open={moveOpen} onOpenChange={setMoveOpen} currentPersonId={personId} onMove={move} />
      <FollowUpSheet
        open={!!followUp}
        onOpenChange={(o) => !o && setFollowUp(null)}
        personId={personId}
        personName={person?.displayName ?? ""}
        noteId={followUp?.noteId ?? null}
        defaultMessage={followUp?.title}
      />
    </div>
  );
}
