"use client";
import { getToolOrDynamicToolName, isToolUIPart, type UIMessage } from "ai";
import { Check, Copy } from "lucide-react";
import { memo, useState } from "react";
import { IconButton } from "@/components/ui/IconButton";
import { cn } from "@/lib/utils";
import { MemoMarkdown } from "./MemoMarkdown";
import { ToolPills, type ToolCall } from "./ToolPills";

type Segment = { kind: "text"; key: string; text: string } | { kind: "tools"; key: string; calls: ToolCall[] };

/** Text runs and groups of consecutive tool calls, in order. */
function segmentsOf(message: UIMessage): Segment[] {
  const out: Segment[] = [];
  message.parts.forEach((part, i) => {
    if (part.type === "text") {
      if (!part.text.trim()) return;
      const prev = out[out.length - 1];
      if (prev?.kind === "text") prev.text += `\n\n${part.text}`;
      else out.push({ kind: "text", key: `t${i}`, text: part.text });
      return;
    }
    if (isToolUIPart(part)) {
      const call: ToolCall = {
        id: part.toolCallId,
        name: getToolOrDynamicToolName(part),
        state: part.state === "output-available" ? "done" : part.state === "output-error" || part.state === "output-denied" ? "failed" : "running",
        output: part.state === "output-available" ? part.output : undefined,
        errorText: part.state === "output-error" ? part.errorText : undefined,
      };
      const prev = out[out.length - 1];
      if (prev?.kind === "tools") prev.calls.push(call);
      else out.push({ kind: "tools", key: `k${i}`, calls: [call] });
    }
  });
  return out;
}

const plainText = (m: UIMessage) =>
  m.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .filter(Boolean)
    .join("\n\n");

/**
 * One chat message. Memoised: while an answer streams only the last message re-renders, and
 * inside it only the last markdown block re-parses. Messages other than the newest skip layout
 * and paint while off-screen (`content-visibility: auto`).
 */
export const Message = memo(function Message({ message, live, streaming }: { message: UIMessage; live: boolean; streaming: boolean }) {
  const isUser = message.role === "user";
  const offscreenCheap = !live && "[content-visibility:auto] [contain-intrinsic-size:auto_120px]";

  if (isUser) {
    return (
      <div className={cn("flex justify-end pl-10", offscreenCheap)}>
        <div className="rounded-lg rounded-br-xs bg-accent-fill px-4 py-2.5 text-body break-words whitespace-pre-wrap text-accent-fg specular">{plainText(message)}</div>
      </div>
    );
  }

  const segments = segmentsOf(message);
  if (!segments.length) return null;
  const hasText = segments.some((s) => s.kind === "text");
  return (
    <div className={cn("group/msg flex flex-col items-start gap-2 pr-6 sm:pr-12", offscreenCheap)}>
      {segments.map((s) =>
        s.kind === "tools" ? (
          <ToolPills key={s.key} calls={s.calls} animateIn={streaming} />
        ) : (
          <div key={s.key} className="surface max-w-full rounded-lg rounded-bl-xs px-4 py-3 text-body text-fg">
            <MemoMarkdown text={s.text} streaming={streaming} />
          </div>
        ),
      )}
      {!streaming && hasText && (
        // Zero-height row: the hover-only button must not add space between messages.
        <div className="relative h-0 w-full">
          <CopyButton text={plainText(message)} />
        </div>
      )}
    </div>
  );
});

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <IconButton
      label={copied ? "Copied" : "Copy answer"}
      icon={copied ? <Check /> : <Copy />}
      variant="plain"
      size="sm"
      className="absolute -top-1 left-0 opacity-0 transition-opacity group-hover/msg:opacity-100 focus-visible:opacity-100 pointer-coarse:hidden"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    />
  );
}
