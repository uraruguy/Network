"use client";
import { cn } from "@/lib/utils";
import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

const base =
  "w-full glass rounded-[var(--r-md)] px-4 text-[16px] text-fg placeholder:text-fg-4 outline-none transition-shadow focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_35%,transparent)]";

export const GlassInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function GlassInput(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cn(base, "h-12", className)} {...rest} />;
});

export const GlassTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function GlassTextarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cn(base, "py-3 min-h-24 resize-none", className)} {...rest} />;
  },
);

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="block text-[13px] font-medium text-fg-2 px-1">{label}</span>
      {children}
      {hint && <span className="block text-[12px] text-fg-3 px-1">{hint}</span>}
    </label>
  );
}
