"use client";
import { ArrowUp, Square } from "lucide-react";
import { forwardRef, useImperativeHandle, useRef, type ReactNode } from "react";
import { useMediaQuery, MQ } from "@/lib/media";
import { cn } from "@/lib/utils";

export type ChatComposerHandle = { focus: () => void };

export type ChatComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** An answer is streaming: the send button becomes Stop. */
  busy?: boolean;
  onStop?: () => void;
  placeholder?: string;
  /** Left side of the toolbar under the text (e.g. the model switch). */
  accessory?: ReactNode;
  disabled?: boolean;
};

/**
 * The chat's message box: auto-growing textarea, Enter to send (Shift+Enter for a new line; on
 * touch phones Return inserts a line and the button sends), Stop while streaming.
 *
 * Same props as the shared composer the Shell track is building (`components/composer/Composer`);
 * swapping it in only needs `accessory` support there.
 */
export const ChatComposer = forwardRef<ChatComposerHandle, ChatComposerProps>(function ChatComposer(
  { value, onChange, onSubmit, busy, onStop, placeholder = "Ask anything…", accessory, disabled },
  ref,
) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const coarse = useMediaQuery(MQ.coarse);
  useImperativeHandle(ref, () => ({ focus: () => textarea.current?.focus() }), []);
  const canSend = !!value.trim() && !busy && !disabled;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSubmit();
      }}
      className="glass-thick specular rounded-xl p-2 transition-shadow duration-200 focus-within:shadow-[0_0_0_3px_var(--focus-ring)]"
    >
      <label className="sr-only" htmlFor="chat-input">
        Message
      </label>
      <textarea
        id="chat-input"
        ref={textarea}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing || coarse) return;
          e.preventDefault();
          if (canSend) onSubmit();
        }}
        placeholder={placeholder}
        rows={1}
        disabled={disabled}
        enterKeyHint="send"
        className="block max-h-40 min-h-11 w-full resize-none bg-transparent px-2.5 py-2 text-body text-fg outline-none placeholder:text-fg-4 [field-sizing:content]"
      />
      <div className="flex items-center gap-2 pt-1">
        <div className="min-w-0 flex-1">{accessory}</div>
        {busy ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop answering"
            className="pressable grid size-9 shrink-0 place-items-center rounded-full bg-fill-3 text-fg hover:bg-fill-2"
          >
            <Square size={13} fill="currentColor" strokeWidth={0} />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send"
            className={cn(
              "pressable grid size-9 shrink-0 place-items-center rounded-full transition-[background-color,opacity] duration-150",
              canSend ? "bg-accent-fill text-accent-fg specular elevation-e1" : "bg-fill-2 text-fg-4",
            )}
          >
            <ArrowUp size={18} strokeWidth={2.6} />
          </button>
        )}
      </div>
    </form>
  );
});
