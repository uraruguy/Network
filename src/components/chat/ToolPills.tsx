"use client";
import { AnimatePresence, motion } from "motion/react";
import { Check, CircleAlert, PencilLine } from "lucide-react";
import { memo } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { spring, useMotionSafe } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { isWriteTool, toolLabel, type ToolState } from "./tool-labels";

export type ToolCall = { id: string; name: string; state: ToolState; output?: unknown; errorText?: string };

/** A row of tool-call pills: spinner while running, then a check (or alert) and a short summary. */
export const ToolPills = memo(function ToolPills({ calls }: { calls: ToolCall[] }) {
  const safe = useMotionSafe();
  return (
    <div className="flex flex-wrap gap-1.5" aria-live="polite">
      {calls.map((c) => {
        const { label, detail, error } = toolLabel(c.name, c.state, c.output);
        const failed = c.state === "failed" || !!error;
        const running = c.state === "running";
        return (
          <motion.span
            key={c.id}
            layout={safe ? "position" : false}
            initial={safe ? { opacity: 0, scale: 0.92, y: 4 } : { opacity: 0 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={spring.snappy}
            title={error ?? c.errorText ?? undefined}
            className={cn(
              "inline-flex h-7 max-w-full items-center gap-1.5 rounded-full px-2.5 text-caption font-medium select-none",
              failed ? "bg-danger-soft text-danger" : running ? "bg-accent-soft text-accent-text" : "bg-fill-2 text-fg-2",
            )}
          >
            <span className="grid size-3.5 shrink-0 place-items-center" aria-hidden>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={failed ? "fail" : running ? "run" : "done"}
                  initial={safe ? { opacity: 0, scale: 0.5 } : { opacity: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={spring.pop}
                  className="grid place-items-center"
                >
                  {failed ? (
                    <CircleAlert size={13} strokeWidth={2.4} />
                  ) : running ? (
                    <Spinner size={12} label="" />
                  ) : isWriteTool(c.name) ? (
                    <PencilLine size={12} strokeWidth={2.4} className="text-accent-text" />
                  ) : (
                    <Check size={13} strokeWidth={2.8} className="text-accent-text" />
                  )}
                </motion.span>
              </AnimatePresence>
            </span>
            <span className={cn("truncate", running && "chat-shimmer")}>
              {label}
              {running && "…"}
            </span>
            {detail && <span className="truncate text-fg-3">· {detail}</span>}
          </motion.span>
        );
      })}
    </div>
  );
});
