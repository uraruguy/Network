"use client";
import { Search, X } from "lucide-react";
import { forwardRef, useRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type SearchFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "size"> & {
  value: string;
  onChange: (value: string) => void;
  /** Called on Enter (keyboard "Search" key). */
  onSubmit?: (value: string) => void;
  /** Escape clears; a second Escape blurs. Default true. */
  clearOnEscape?: boolean;
  size?: "md" | "lg";
  /** Floating variant (glass) for search over maps/imagery. */
  glass?: boolean;
};

/**
 * iOS search field: magnifier, translucent fill, custom clear button (the WebKit cancel button
 * is hidden), `enterKeyHint="search"`, 17px text (no zoom on focus).
 */
export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  { value, onChange, onSubmit, clearOnEscape = true, size = "md", glass, className, placeholder = "Search", onKeyDown, ...rest },
  forwardedRef,
) {
  const inner = useRef<HTMLInputElement | null>(null);
  const setRef = (el: HTMLInputElement | null) => {
    inner.current = el;
    if (typeof forwardedRef === "function") forwardedRef(el);
    else if (forwardedRef) forwardedRef.current = el;
  };
  return (
    <div
      role="search"
      className={cn(
        "relative flex w-full items-center",
        size === "lg" ? "h-11" : "h-10",
        glass ? "glass rounded-full" : "rounded-sm bg-fill-2",
        "focus-within:shadow-[0_0_0_3px_var(--focus-ring)] transition-shadow duration-150",
        className,
      )}
    >
      <Search size={17} strokeWidth={2.2} aria-hidden className="pointer-events-none absolute left-3 text-fg-3" />
      <input
        ref={setRef}
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (e.defaultPrevented) return;
          if (e.key === "Enter") onSubmit?.(value);
          if (e.key === "Escape" && clearOnEscape) {
            if (value) {
              e.preventDefault();
              onChange("");
            } else e.currentTarget.blur();
          }
        }}
        className="h-full w-full min-w-0 appearance-none bg-transparent pr-9 pl-9.5 text-body text-fg outline-none placeholder:text-fg-3 [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
        {...rest}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            onChange("");
            inner.current?.focus();
          }}
          className="hit-44 absolute right-2.5 grid size-[18px] place-items-center rounded-full bg-fg-4 text-bg transition-opacity hover:opacity-80"
        >
          <X size={11} strokeWidth={3} />
        </button>
      )}
    </div>
  );
});
