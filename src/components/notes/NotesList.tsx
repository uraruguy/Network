"use client";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRightLeft, Bell, Pin, PinOff, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { FollowUpSheet } from "@/components/followups/FollowUpSheet";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { toast } from "@/components/ui/Toast";
import { useNow } from "@/lib/clock";
import { spring } from "@/lib/motion";
import { groupNotes } from "@/lib/notes/grouping";
import { displayTitle } from "@/lib/notes/title";
import { useNoteActions } from "@/lib/queries/notes";
import type { NoteSummary } from "@/lib/queries/types";
import { MovePersonSheet } from "./MovePersonSheet";
import { NoteRow } from "./NoteRow";

/**
 * A person's notes grouped like Apple Notes (Pinned, Today, Yesterday, Previous 7 Days, …).
 * Long-press / right-click a row: Pin, Follow up…, Move to person…, Delete (with Undo).
 * Focused row + ⌘⌫ deletes.
 */
export function NotesList({ notes, personId, personName }: { notes: NoteSummary[]; personId: string; personName: string }) {
  const now = useNow();
  const actions = useNoteActions();
  const sections = useMemo(() => groupNotes(notes, now), [notes, now]);
  const [followUp, setFollowUp] = useState<NoteSummary | null>(null);
  const [moving, setMoving] = useState<NoteSummary | null>(null);

  return (
    <div className="space-y-5">
      {sections.map((section) => (
        <section key={section.key} aria-label={section.label} className="space-y-1.5">
          <h3 className="px-4 text-footnote font-semibold tracking-[0.02em] text-fg-3 uppercase">{section.label}</h3>
          <ul className="surface overflow-hidden rounded-lg">
            <AnimatePresence initial={false}>
              {section.items.map((n) => (
                <motion.li
                  key={n.id}
                  layout="position"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.15 } }}
                  transition={spring.smooth}
                  className="relative after:absolute after:right-0 after:bottom-0 after:left-4 after:h-[0.5px] after:bg-separator last:after:hidden"
                >
                  <ContextMenu
                    title={displayTitle(n)}
                    items={[
                      { label: n.pinned ? "Unpin" : "Pin", icon: n.pinned ? <PinOff /> : <Pin />, onSelect: () => actions.setPinned(n, !n.pinned) },
                      { label: "Follow Up…", icon: <Bell />, onSelect: () => setFollowUp(n) },
                      { label: "Move to Person…", icon: <ArrowRightLeft />, onSelect: () => setMoving(n) },
                      "separator",
                      { label: "Delete", icon: <Trash2 />, destructive: true, shortcut: "⌘⌫", onSelect: () => actions.remove(n) },
                    ]}
                  >
                    <NoteRow
                      note={n}
                      href={`/people/${personId}/notes/${n.id}`}
                      className="rounded-none"
                      onKeyDown={(e) => {
                        if ((e.metaKey || e.ctrlKey) && e.key === "Backspace") {
                          e.preventDefault();
                          actions.remove(n);
                        }
                      }}
                    />
                  </ContextMenu>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </section>
      ))}

      <MovePersonSheet
        open={!!moving}
        onOpenChange={(o) => !o && setMoving(null)}
        currentPersonId={personId}
        onMove={(to) => {
          if (!moving) return;
          actions.move(moving, to.id);
          toast.success(`Moved to ${to.displayName}`);
        }}
      />
      <FollowUpSheet
        open={!!followUp}
        onOpenChange={(o) => !o && setFollowUp(null)}
        personId={personId}
        personName={personName}
        noteId={followUp?.id ?? null}
        defaultMessage={followUp ? displayTitle(followUp) : undefined}
      />
    </div>
  );
}
