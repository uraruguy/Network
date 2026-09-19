"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Pin, PinOff, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassCard } from "@/components/glass/GlassCard";
import { NOTE_KINDS, type NoteKind } from "@/lib/db/schema";
import { useDeleteNote, useNote, useUpdateNote } from "@/lib/queries/notes";
import { usePerson } from "@/lib/queries/people";
import { cn, formatDate } from "@/lib/utils";
import { NoteEditor, type NoteContent } from "./NoteEditor";

const KIND_LABEL: Record<NoteKind, string> = { note: "Note", meeting: "Meeting", call: "Call", message: "Message" };

export function NotePage({ personId, noteId }: { personId: string; noteId: string }) {
  const router = useRouter();
  const { data: note, isPending } = useNote(noteId);
  const { data: person } = usePerson(personId);
  const update = useUpdateNote();
  const del = useDeleteNote();
  const [status, setStatus] = useState<"idle" | "dirty" | "saving" | "saved">("idle");
  const pending = useRef<NoteContent | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    const c = pending.current;
    if (!c) return;
    pending.current = null;
    setStatus("saving");
    update.mutate(
      { id: noteId, patch: { contentJson: c.json, contentMd: c.md, contentText: c.text, title: c.title } },
      { onSuccess: () => setStatus((s) => (s === "saving" ? "saved" : s)), onError: () => setStatus("dirty") },
    );
  }, [noteId, update]);

  const onChange = useCallback(
    (c: NoteContent) => {
      pending.current = c;
      setStatus("dirty");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 800);
    },
    [flush],
  );

  // Flush on unmount / tab hide so nothing is lost when the PWA is backgrounded.
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      if (timer.current) clearTimeout(timer.current);
      flush();
    };
  }, [flush]);

  if (isPending || !note) return <div className="glass h-64 animate-pulse rounded-[var(--r-lg)]" />;

  return (
    <div className="mx-auto max-w-[760px]">
      <div className="mb-3 flex items-center justify-between">
        <Link href={`/people/${personId}`} className="pressable inline-flex h-9 items-center gap-1 rounded-full pr-3 pl-1.5 text-[15px] font-medium text-accent-strong hover:bg-accent-soft">
          <ArrowLeft size={18} /> {person?.displayName ?? "Back"}
        </Link>
        <div className="flex items-center gap-2">
          <span className={cn("text-[12px] transition-opacity", status === "idle" ? "opacity-0" : "text-fg-3")}>
            {status === "saving" ? "Saving…" : status === "saved" ? <span className="inline-flex items-center gap-1"><Check size={12} /> Saved</span> : "Unsaved"}
          </span>
          <GlassButton size="iconSm" aria-label={note.pinned ? "Unpin" : "Pin"} onClick={() => update.mutate({ id: noteId, patch: { pinned: !note.pinned } })}>
            {note.pinned ? <PinOff size={15} /> : <Pin size={15} />}
          </GlassButton>
          <GlassButton
            size="iconSm"
            variant="danger"
            aria-label="Delete"
            onClick={() => {
              if (!confirm("Delete this note?")) return;
              pending.current = null;
              del.mutate({ id: noteId, personId }, { onSuccess: () => router.replace(`/people/${personId}`) });
            }}
          >
            <Trash2 size={15} />
          </GlassButton>
        </div>
      </div>

      <GlassCard strong className="px-5 py-4 sm:px-8 sm:py-6">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px] text-fg-3">
          <div className="glass flex rounded-full p-0.5">
            {NOTE_KINDS.map((k) => (
              <button key={k} onClick={() => update.mutate({ id: noteId, patch: { kind: k } })}
                className={cn("pressable rounded-full px-2.5 py-1 text-[12px] font-medium", note.kind === k ? "bg-accent text-accent-fg" : "text-fg-3")}>
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <input
            type="date"
            className="rounded-full bg-transparent px-1 text-[13px] text-fg-3 outline-none"
            value={new Date(note.occurredAt).toISOString().slice(0, 10)}
            onChange={(e) => e.target.value && update.mutate({ id: noteId, patch: { occurredAt: new Date(e.target.value + "T12:00:00").toISOString() } })}
          />
          <span className="ml-auto">Edited {formatDate(note.updatedAt)}</span>
        </div>
        <NoteEditor initialJson={note.contentJson} initialMd={note.contentMd} autoFocus={!note.contentText} onChange={onChange} />
      </GlassCard>
    </div>
  );
}
