"use client";
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Spinner } from "@/components/ui/Spinner";

export const buttonVariants = cva(
  "pressable relative inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold select-none outline-offset-2 disabled:opacity-45 disabled:pointer-events-none aria-busy:pointer-events-none",
  {
    variants: {
      variant: {
        /** Solid accent — the one primary action on a screen. */
        primary: "bg-accent-fill text-accent-fg specular elevation-e1 hover:brightness-[1.05] active:brightness-95",
        /** Translucent, blurred — floating over content/imagery. */
        glass: "glass specular text-fg hover:bg-surface-4",
        /** Flat surface — secondary actions inside cards and lists. */
        surface: "surface text-fg hover:bg-surface-2",
        /** Tinted accent — secondary emphasis. */
        soft: "bg-accent-soft text-accent-text hover:brightness-[0.97] dark:hover:brightness-110",
        /** Text-only (iOS "plain") — toolbar / header actions. */
        plain: "text-accent-text hover:bg-accent-soft",
        ghost: "text-fg-2 font-medium hover:bg-fill-1 hover:text-fg",
        danger: "bg-danger-soft text-danger hover:brightness-[0.97] dark:hover:brightness-110",
        destructive: "bg-danger-fill text-white specular elevation-e1 hover:brightness-[1.05]",
      },
      size: {
        sm: "hit-44 h-8 px-3.5 text-footnote font-semibold rounded-full",
        md: "h-11 px-5 text-subhead rounded-full",
        lg: "h-[50px] px-6 text-headline rounded-full",
        icon: "h-11 w-11 rounded-full",
        iconSm: "hit-44 h-8 w-8 rounded-full",
      },
    },
    defaultVariants: { variant: "glass", size: "md" },
  },
);

export type GlassButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    /** Shows a spinner, keeps the width, blocks presses. */
    loading?: boolean;
  };

export const GlassButton = forwardRef<HTMLButtonElement, GlassButtonProps>(function GlassButton(
  { className, variant, size, type = "button", loading, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size }), className)}
      {...rest}
    >
      {loading ? (
        <>
          <span className="invisible inline-flex items-center gap-2">{children}</span>
          <span className="absolute inset-0 grid place-items-center">
            <Spinner size={size === "sm" || size === "iconSm" ? 14 : 18} />
          </span>
        </>
      ) : (
        children
      )}
    </button>
  );
});
