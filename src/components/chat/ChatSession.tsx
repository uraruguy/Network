"use client";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, RotateCcw, Sparkles, Zap } from "lucide-react";
import { useRef, useState } from "react";
import { Composer } from "@/components/composer/Composer";
import { GlassButton } from "@/components/glass/GlassButton";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { fadeScale, useMotionSafe } from "@/lib/motion";
import { ChatEmpty } from "./ChatEmpty";
import { Message } from "./Message";
import { useStickToBottom } from "./useStickToBottom";

export type ChatModelChoice = "smart" | "fast";

/**
 * Sends only the newest message; the server loads the rest of the thread. Per-request extras
 * (person, model) arrive through `sendMessage(…, { body })`.
 */
const transport = new DefaultChatTransport({
  api: "/api/chat",
  prepareSendMessagesRequest: ({ id, messages, body }) => ({ body: { ...body, id, message: messages[messages.length - 1] } }),
});

type Props = {
  threadId: string;
  initialMessages: UIMessage[];
  /** Person the conversation is about (new threads only; the server remembers it afterwards). */
  personId: string | null;
  personName: string | null;
  homeCity: string | null;
  model: ChatModelChoice;
  onModelChange: (model: ChatModelChoice) => void;
  /** First message of a new conversation was sent (the thread now exists). */
  onStarted: (threadId: string) => void;
  onTurnFinished: (threadId: string, messages: UIMessage[]) => void;
};

/**
 * One conversation. The transport sends only the newest message (the server holds the
 * transcript); answers stream with a 50 ms render throttle.
 */
export function ChatSession({ threadId, initialMessages, personId, personName, homeCity, model, onModelChange, onStarted, onTurnFinished }: Props) {
  const { messages, sendMessage, regenerate, status, stop, error, clearError } = useChat({
    id: threadId,
    messages: initialMessages,
    transport,
    throttle: 50,
    generateId: () => crypto.randomUUID(),
    onFinish: ({ messages: all }) => onTurnFinished(threadId, all),
  });

  const [input, setInput] = useState("");
  const { scrollRef, contentRef, atBottom, scrollToBottom } = useStickToBottom();
  const safe = useMotionSafe();
  const busy = status === "submitted" || status === "streaming";
  const started = useRef(initialMessages.length > 0);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    if (error) clearError();
    void sendMessage({ text: t }, { body: { personId, model } });
    setInput("");
    if (!started.current) {
      started.current = true;
      onStarted(threadId);
    }
    requestAnimationFrame(() => scrollToBottom("smooth"));
  };

  // "Thinking" until the answer shows something (text or a tool pill).
  const last = messages[messages.length - 1];
  const waiting =
    busy && (last?.role !== "assistant" || !last.parts.some((p) => (p.type === "text" && p.text.trim()) || p.type.startsWith("tool-") || p.type === "dynamic-tool"));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} className="no-scrollbar h-full overflow-y-auto overscroll-contain [mask-image:linear-gradient(to_bottom,transparent,black_14px)]">
          <div ref={contentRef} className="mx-auto flex min-h-full w-full max-w-[760px] flex-col gap-4 pt-2 pb-6">
            {messages.length === 0 ? (
              <ChatEmpty personName={personName} homeCity={homeCity} onPick={send} />
            ) : (
              messages.map((m, i) => <Message key={m.id} message={m} live={i >= messages.length - 2} streaming={busy && i === messages.length - 1} />)
            )}

            <AnimatePresence>
              {waiting && (
                <motion.div
                  key="thinking"
                  variants={fadeScale}
                  initial={safe ? "initial" : false}
                  animate="animate"
                  exit="exit"
                  className="flex items-center gap-2 pl-1 text-footnote text-fg-3"
                  role="status"
                >
                  <span className="chat-dots" aria-hidden>
                    <span />
                    <span />
                    <span />
                  </span>
                  Thinking…
                </motion.div>
              )}
            </AnimatePresence>

            {error && !busy && (
              <div className="flex flex-wrap items-center gap-3 rounded-md bg-danger-soft px-4 py-3 text-subhead text-danger" role="alert">
                <span className="min-w-0 flex-1">{error.message || "Something went wrong."}</span>
                <GlassButton variant="surface" size="sm" onClick={() => void regenerate({ body: { personId, model } })}>
                  <RotateCcw size={14} /> Try again
                </GlassButton>
              </div>
            )}
          </div>
        </div>

        <AnimatePresence>
          {!atBottom && messages.length > 0 && (
            <motion.div
              key="jump"
              variants={fadeScale}
              initial="initial"
              animate="animate"
              exit="exit"
              className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center"
            >
              <button
                type="button"
                onClick={() => scrollToBottom("smooth")}
                aria-label="Jump to latest"
                className="pressable glass-thick specular pointer-events-auto grid size-10 place-items-center rounded-full text-fg-2 hover:text-fg"
              >
                <ArrowDown size={18} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mx-auto w-full max-w-[760px] pt-2">
        <Composer
          value={input}
          onValueChange={setInput}
          onSubmit={send}
          submitOnEnter="desktop"
          streaming={busy}
          onStop={() => void stop()}
          label="Message"
          placeholder={personName ? `Ask about ${personName}…` : "Ask, add a note, plan a follow-up…"}
          accessory={
            <SegmentedControl
              size="sm"
              aria-label="Model"
              value={model}
              onChange={onModelChange}
              // Icons only on phones so the text field keeps its width.
              className="mb-0.5 max-sm:[&_button]:gap-0"
              items={[
                { value: "smart", label: <span className="max-sm:hidden">Smart</span>, ariaLabel: "Smart", icon: <Sparkles /> },
                { value: "fast", label: <span className="max-sm:hidden">Fast</span>, ariaLabel: "Fast", icon: <Zap /> },
              ]}
            />
          }
        />
      </div>
    </div>
  );
}
