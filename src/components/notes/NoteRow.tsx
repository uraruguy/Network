import Link from "next/link";
import { Pin } from "lucide-react";
import { formatRelative } from "@/lib/utils";

const KIND_LABEL: Record<string, string> = { note: "", meeting: "Meeting", call: "Call", message: "Message" };

export function NoteRow({ note, href, person }: { note: { id: string; title: string | null; contentText: string; kind: string; occurredAt: Date | string; pinned?: boolean }; href: string; person?: { displayName: string } | null }) {
  const title = note.title?.trim() || firstLine(note.contentText) || "Untitled";
  const snippet = note.contentText.replace(title, "").trim().slice(0, 140);
  return (
    <Link href={href} className="pressable block rounded-[14px] px-3 py-2.5 hover:bg-white/50 dark:hover:bg-white/5">
      <div className="flex items-center gap-2">
        {note.pinned && <Pin size={13} className="shrink-0 text-accent-strong" />}
        <span className="truncate text-[15.5px] font-semibold tracking-tight">{title}</span>
        <span className="ml-auto shrink-0 text-[12px] text-fg-3">{formatRelative(note.occurredAt)}</span>
      </div>
      <p className="mt-0.5 line-clamp-2 text-[13.5px] text-fg-2">
        {person && <span className="font-medium text-fg">{person.displayName} · </span>}
        {KIND_LABEL[note.kind] && <span className="text-accent-strong">{KIND_LABEL[note.kind]} · </span>}
        {snippet || <span className="text-fg-4">Empty note</span>}
      </p>
    </Link>
  );
}

function firstLine(s: string) {
  return s.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
}
