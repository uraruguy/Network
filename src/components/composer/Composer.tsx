"use client";
import { ArrowUp, Square } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { Tooltip } from "@/components/ui/Tooltip";
import { useCoarsePointer } from "@/lib/media";
import { cn } from "@/lib/utils";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
const LINE_HEIGHT = 22; // text-body

export type ComposerProps = {
  /** Called with the trimmed text. The field clears unless it returns `false`; a returned
   *  promise that rejects puts the text back. */
  onSubmit: (text: string) => void | boolean | Promise<unknown>;
  /** Controlled value (pair with `onValueChange`); omit for an uncontrolled field. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  /** Accessible name of the text field (defaults to the placeholder). */
  label?: string;
  /** Leading decoration (e.g. an icon), bottom-aligned with the first line. */
  leading?: ReactNode;
  /** Extra controls left of the send button (attach, person chip…). */
  accessory?: ReactNode;
  /**
   * When plain Enter sends. Default `false`: only ⌘↩ / Ctrl↩ send and Enter makes a new line
   * (notes, capture). `"desktop"`: Enter sends on mouse/trackpad devices, Shift↩ for a new line
   * (chat). `true`: Enter always sends.
   */
  submitOnEnter?: boolean | "desktop";
  /** Busy: spinner in the send button, submits blocked. */
  pending?: boolean;
  disabled?: boolean;
  /** Streaming (chat): the send button becomes a stop button calling `onStop`. */
  streaming?: boolean;
  onStop?: () => void;
  /** Grows up to this many lines, then scrolls. */
  maxRows?: number;
  autoFocus?: boolean;
  sendLabel?: string;
  /** Keyboard hint under the field on desktop while focused; `false` hides it. */
  hint?: ReactNode | false;
  name?: string;
  className?: string;
};

export type ComposerHandle = { focus: () => void; clear: () => void; textarea: HTMLTextAreaElement | null };

/**
 * Glass message field: autogrowing textarea + round send button. ⌘↩ sends; IME-safe.
 * Used by Today's quick capture and the Chat input.
 *
 *   <Composer placeholder="Ask your network…" submitOnEnter="desktop" onSubmit={send}
 *             streaming={status === "streaming"} onStop={stop} />
 */
export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  {
    onSubmit,
    value: controlled,
    defaultValue = "",
    onValueChange,
    placeholder,
    label,
    leading,
    accessory,
    submitOnEnter = false,
    pending = false,
    disabled = false,
    streaming = false,
    onStop,
    maxRows = 8,
    autoFocus,
    sendLabel = "Send",
    hint,
    name,
    className,
  },
  ref,
) {
  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const value = controlled ?? uncontrolled;
  const textarea = useRef<HTMLTextAreaElement>(null);
  const coarse = useCoarsePointer();
  const [focused, setFocused] = useState(false);

  const setValue = useCallback(
    (v: string) => {
      if (controlled === undefined) setUncontrolled(v);
      onValueChange?.(v);
    },
    [controlled, onValueChange],
  );

  useImperativeHandle(ref, () => ({ focus: () => textarea.current?.focus(), clear: () => setValue(""), textarea: textarea.current }), [setValue]);

  // Autogrow (field-sizing isn't everywhere yet): measure on every value change.
  useIsoLayoutEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    const max = LINE_HEIGHT * maxRows + 20;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, [value, maxRows]);

  const text = value.trim();
  // While streaming the button is Stop: ⌘↩ / Enter must not send (and clear) the next message.
  const canSend = !!text && !pending && !disabled && !streaming;

  const submit = () => {
    if (!canSend) return;
    const result = onSubmit(text);
    if (result === false) return;
    setValue("");
    if (result instanceof Promise) result.catch(() => setValue(text));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    const mod = e.metaKey || e.ctrlKey;
    const enterSends = submitOnEnter === true || (submitOnEnter === "desktop" && !coarse);
    if (mod || (enterSends && !e.shiftKey)) {
      e.preventDefault();
      submit();
    }
  };

  const enterHint = submitOnEnter === true || (submitOnEnter === "desktop" && !coarse);
  const showHint = hint !== false && focused && !coarse && !!text;

  const button = streaming ? (
    <button
      type="button"
      onClick={onStop}
      aria-label="Stop"
      className="pressable grid size-9 shrink-0 place-items-center rounded-full bg-fg text-bg"
    >
      <Square size={13} fill="currentColor" strokeWidth={0} />
    </button>
  ) : (
    <button
      type="submit"
      disabled={!canSend}
      aria-label={sendLabel}
      aria-busy={pending || undefined}
      className={cn(
        "pressable grid size-9 shrink-0 place-items-center rounded-full transition-[background-color,color,transform] duration-200",
        canSend || pending ? "bg-accent-fill text-accent-fg specular" : "bg-fill-2 text-fg-4",
      )}
    >
      {pending ? <Spinner size={16} label="Sending" /> : <ArrowUp size={19} strokeWidth={2.6} aria-hidden />}
    </button>
  );

  return (
    <div className={className}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className={cn(
          "glass-thick specular flex items-end gap-2 rounded-xl p-1.5 transition-[box-shadow] duration-200",
          "has-[textarea:focus-visible]:outline-2 has-[textarea:focus-visible]:outline-offset-2 has-[textarea:focus-visible]:outline-[var(--focus-ring)]",
          leading ? "pl-3.5" : "pl-4",
          disabled && "opacity-60",
        )}
      >
        {leading && (
          <span className="grid h-9 shrink-0 place-items-center text-accent-text" aria-hidden>
            {leading}
          </span>
        )}
        <textarea
          ref={textarea}
          name={name}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          aria-label={label ?? placeholder}
          rows={1}
          disabled={disabled}
          autoFocus={autoFocus}
          enterKeyHint={enterHint ? "send" : "enter"}
          className="min-h-9 flex-1 resize-none self-center bg-transparent py-[7px] text-body text-fg outline-none placeholder:text-fg-4 disabled:cursor-not-allowed"
        />
        {accessory}
        {streaming ? (
          button
        ) : (
          <Tooltip content={sendLabel} shortcut={enterHint ? "↩" : "⌘↩"} side="top">
            {button}
          </Tooltip>
        )}
      </form>
      {hint !== false && (
        <p
          aria-hidden
          className={cn(
            "mt-1.5 hidden h-4 px-4 text-caption text-fg-3 transition-opacity duration-200 [@media(hover:hover)]:block",
            showHint ? "opacity-100" : "opacity-0",
          )}
        >
          {hint ?? (enterHint ? "↩ to send · ⇧↩ for a new line" : "⌘↩ to send")}
        </p>
      )}
    </div>
  );
});
