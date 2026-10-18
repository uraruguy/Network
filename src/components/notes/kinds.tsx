import { FileText, MessageCircle, Phone, Users } from "lucide-react";
import type { ReactNode } from "react";
import { NOTE_KINDS, type NoteKind } from "@/lib/constants";

export const KIND_META: Record<NoteKind, { label: string; icon: (size?: number) => ReactNode }> = {
  note: { label: "Note", icon: (s = 16) => <FileText size={s} /> },
  meeting: { label: "Meeting", icon: (s = 16) => <Users size={s} /> },
  call: { label: "Call", icon: (s = 16) => <Phone size={s} /> },
  message: { label: "Message", icon: (s = 16) => <MessageCircle size={s} /> },
};

export const KIND_ITEMS = NOTE_KINDS.map((k) => ({ value: k, label: KIND_META[k].label }));

export const isNoteKind = (k: string): k is NoteKind => (NOTE_KINDS as readonly string[]).includes(k);

/** Small kind glyph for list rows (nothing for plain notes). */
export function KindGlyph({ kind, className }: { kind: string; className?: string }) {
  if (!isNoteKind(kind) || kind === "note") return null;
  return (
    <span className={className} role="img" aria-label={KIND_META[kind].label}>
      {KIND_META[kind].icon(14)}
    </span>
  );
}
