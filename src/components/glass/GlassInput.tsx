"use client";
import { cn } from "@/lib/utils";
import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

/** Shared text-control look: flat surface, hairline, accent focus ring, 17px (no iOS zoom). */
export const inputClass =
  "w-full rounded-sm border-[0.5px] border-hairline bg-surface-2 px-4 text-body text-fg placeholder:text-fg-4 outline-none shadow-e1 transition-[box-shadow,border-color] duration-150 ease-out focus:border-accent focus:shadow-[0_0_0_3px_var(--focus-ring)] aria-invalid:border-danger aria-invalid:focus:shadow-[0_0_0_3px_var(--danger-soft)] disabled:opacity-50";

export const GlassInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function GlassInput(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cn(inputClass, "h-11", className)} {...rest} />;
});

export const GlassTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function GlassTextarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cn(inputClass, "min-h-24 resize-none py-3", className)} {...rest} />;
  },
);

/**
 * v1 label wrapper (kept for existing forms). New forms: `@/components/ui/Field` (adds error
 * text, ids and aria wiring for `noValidate` forms).
 */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="block px-1 text-footnote font-medium text-fg-2">{label}</span>
      {children}
      {error ? (
        <span role="alert" className="block px-1 text-caption text-danger">
          {error}
        </span>
      ) : (
        hint && <span className="block px-1 text-caption text-fg-3">{hint}</span>
      )}
    </label>
  );
}
