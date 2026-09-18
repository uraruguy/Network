"use client";
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";

const button = cva(
  "pressable inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium select-none disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-fg shadow-[0_8px_24px_-8px_var(--accent)] hover:brightness-105",
        glass: "glass specular text-fg hover:bg-[var(--glass-strong)]",
        ghost: "text-fg-2 hover:bg-accent-soft hover:text-fg",
        soft: "bg-accent-soft text-accent-strong hover:brightness-95",
        danger: "bg-danger/10 text-danger hover:bg-danger/15",
      },
      size: {
        sm: "h-8 px-3 text-[13px] rounded-full",
        md: "h-10 px-4 text-[15px] rounded-full",
        lg: "h-12 px-5 text-[16px] rounded-full",
        icon: "h-10 w-10 rounded-full",
        iconSm: "h-8 w-8 rounded-full",
      },
    },
    defaultVariants: { variant: "glass", size: "md" },
  },
);

export type GlassButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>;

export const GlassButton = forwardRef<HTMLButtonElement, GlassButtonProps>(function GlassButton(
  { className, variant, size, type = "button", ...rest },
  ref,
) {
  return <button ref={ref} type={type} className={cn(button({ variant, size }), className)} {...rest} />;
});
