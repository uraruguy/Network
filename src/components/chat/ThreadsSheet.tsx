"use client";
import { MessageSquare, Trash2 } from "lucide-react";
import { confirm } from "@/components/ui/confirm";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { RelativeTime } from "@/components/ui/RelativeTime";
import { Sheet } from "@/components/ui/Sheet";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { useChatThreads, useDeleteChatThread } from "@/lib/queries/chat";
import { cn } from "@/lib/utils";

/** Past conversations: open one, or delete it. */
export function ThreadsSheet({ open, onOpenChange, activeId, onOpen }: { open: boolean; onOpenChange: (open: boolean) => void; activeId: string | null; onOpen: (id: string) => void }) {
  const { data: threads, isPending } = useChatThreads({ enabled: open });
  const remove = useDeleteChatThread();

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Conversations" size="large" width={480}>
      {isPending ? (
        <SkeletonRows count={6} avatar={false} />
      ) : !threads?.length ? (
        <EmptyState compact icon={<MessageSquare />} title="No conversations yet" description="Your chats with the assistant show up here." />
      ) : (
        <ul className="surface -mx-1 overflow-hidden rounded-lg">
          {threads.map((t) => (
            <li key={t.id} className="relative flex items-center after:absolute after:right-0 after:bottom-0 after:left-4 after:h-[0.5px] after:bg-separator last:after:hidden">
              <button
                type="button"
                onClick={() => onOpen(t.id)}
                aria-current={t.id === activeId || undefined}
                className={cn(
                  "min-w-0 flex-1 px-4 py-2.5 text-left outline-none transition-colors active:bg-fill-2 focus-visible:bg-fill-1 [@media(hover:hover)]:hover:bg-fill-1",
                  t.id === activeId && "bg-accent-soft",
                )}
              >
                <span className="block truncate text-body text-fg">{t.title || "Untitled"}</span>
                <RelativeTime date={t.updatedAt} className="block text-footnote text-fg-3" />
              </button>
              <IconButton
                label={`Delete “${t.title || "Untitled"}”`}
                icon={<Trash2 />}
                variant="danger"
                size="sm"
                className="mr-3"
                onClick={async () => {
                  if (await confirm({ title: "Delete this conversation?", message: "The messages are removed for good. Notes the assistant added stay.", destructive: true })) remove.mutate(t.id);
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
