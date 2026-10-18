import { PageHeader } from "@/components/shell/PageHeader";
import { cn } from "@/lib/utils";
import { Bar, ComposerSkeleton, SkeletonRegion } from "./parts";

const BUBBLES: { me: boolean; w: number; lines: number }[] = [
  { me: true, w: 52, lines: 1 },
  { me: false, w: 78, lines: 3 },
  { me: true, w: 40, lines: 1 },
  { me: false, w: 70, lines: 2 },
];

/**
 * Chat while a thread loads: title, alternating message bubbles, composer pinned at the bottom.
 * In-page: `<ChatSkeleton header={false} />`.
 */
export function ChatSkeleton({ header = true }: { header?: boolean }) {
  return (
    <>
      {header && <PageHeader title="Chat" />}
      <SkeletonRegion label="Loading conversation" className="flex min-h-[calc(100dvh-var(--page-pt)-var(--page-pb)-7rem)] flex-col">
        <div className="flex-1 space-y-4">
          {BUBBLES.map((b, i) => (
            <div key={i} className={cn("flex", b.me ? "justify-end" : "justify-start")}>
              <div className={cn("space-y-2 rounded-lg px-4 py-3", b.me ? "bg-accent-soft" : "surface")} style={{ width: `${b.w}%` }}>
                {Array.from({ length: b.lines }).map((_, j) => (
                  <Bar key={j} className="h-3" style={{ width: j === b.lines - 1 && b.lines > 1 ? "60%" : "100%" }} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <ComposerSkeleton hint={false} className="sticky bottom-[calc(var(--chrome-bottom)+12px)] mt-6 lg:bottom-6" />
      </SkeletonRegion>
    </>
  );
}
