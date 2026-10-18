"use client";
import Link from "next/link";
import { FileText, MessageSquare, Phone, Sparkles, Users, type LucideIcon } from "lucide-react";
import { ListSkeleton } from "@/components/skeletons/parts";
import { NAV_FORWARD, TAB } from "@/components/shell/transitions";
import { RelativeTime } from "@/components/ui/RelativeTime";
import type { NoteKind } from "@/lib/constants";
import { useQueryReady } from "@/lib/offline/useCacheReady";
import { useRecentNotes } from "@/lib/queries/notes";
import { Section } from "./Section";

const KIND_ICON: Record<NoteKind, LucideIcon> = { note: FileText, meeting: Users, call: Phone, message: MessageSquare };

function noteTitle(n: { title: string | null; excerpt?: string | null }) {
  if (n.title?.trim()) return n.title.trim();
  const first = n.excerpt?.split("\n").find((l) => l.trim());
  return first?.trim() || "Untitled note";
}

/** Most recently edited notes, newest first. */
export function RecentNotes({ className }: { className?: string }) {
  const recent = useRecentNotes(6);
  const loading = !useQueryReady(recent);
  const notes = (loading ? undefined : recent.data) ?? [];

  return (
    <Section
      id="recent-notes"
      title="Recent notes"
      action={
        <Link href="/chat" transitionTypes={TAB} className="inline-flex items-center gap-1 font-medium text-accent-text">
          <Sparkles size={14} aria-hidden /> Ask
        </Link>
      }
      className={className}
    >
      {loading ? (
        <div className="ui-skeleton-reveal" role="status" aria-label="Loading notes">
          <ListSkeleton rows={4} avatar={false} />
        </div>
      ) : notes.length === 0 ? (
        <p className="surface rounded-lg px-4 py-4 text-subhead text-fg-2">Notes you write about people show up here.</p>
      ) : (
        <ul className="surface overflow-hidden rounded-lg">
          {notes.map((n) => {
            const Icon = KIND_ICON[n.kind as NoteKind] ?? FileText;
            return (
              <li key={n.id} className="relative after:absolute after:right-0 after:bottom-0 after:left-[58px] after:h-[0.5px] after:bg-separator last:after:hidden">
                <Link
                  href={`/people/${n.personId}/notes/${n.id}`}
                  transitionTypes={NAV_FORWARD}
                  className="flex min-h-[56px] items-center gap-3 px-4 py-2.5 outline-none transition-colors duration-150 focus-visible:bg-fill-1 active:bg-fill-2 [@media(hover:hover)]:hover:bg-fill-1"
                >
                  <span className="grid size-[30px] shrink-0 place-items-center rounded-xs bg-accent-soft text-accent-text" aria-hidden>
                    <Icon size={16} strokeWidth={2.1} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body text-fg">{noteTitle(n)}</span>
                    <span className="block truncate text-footnote text-fg-3">
                      {n.person.displayName} · <RelativeTime date={n.updatedAt} />
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
