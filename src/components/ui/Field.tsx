"use client";
import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type FieldProps = {
  label: ReactNode;
  /** Helper text under the control (hidden while an error shows). */
  hint?: ReactNode;
  /** Validation message; sets `aria-invalid` + `aria-describedby` on the control. */
  error?: ReactNode;
  /** Marks the label (visual only — validate in code; forms should be `noValidate`). */
  required?: boolean;
  /** Right-aligned accessory in the label row (e.g. a character counter). */
  accessory?: ReactNode;
  /** A single control element; it receives `id`, `aria-describedby`, `aria-invalid`. */
  children: ReactElement<Record<string, unknown>> | ReactNode;
  className?: string;
};

/**
 * Label + control + hint/error, wired for screen readers. Use inside `<form noValidate>` and
 * show your own `error` — never the browser's validation bubbles.
 *
 *   <Field label="Email" error={errors.email}><GlassInput type="email" … /></Field>
 */
export function Field({ label, hint, error, required, accessory, children, className }: FieldProps) {
  const id = useId();
  const controlId = `${id}-control`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id: (children.props as { id?: string }).id ?? controlId,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })
    : children;
  const htmlFor = isValidElement(children) ? ((children.props as { id?: string }).id ?? controlId) : undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2 px-1">
        <label htmlFor={htmlFor} className="text-footnote font-medium text-fg-2">
          {label}
          {required && (
            <span aria-hidden className="ml-0.5 text-fg-4">
              *
            </span>
          )}
        </label>
        {accessory && <span className="text-caption text-fg-3">{accessory}</span>}
      </div>
      {control}
      {error ? (
        <p id={errorId} role="alert" className="px-1 text-caption text-danger">
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className="px-1 text-caption text-fg-3">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
