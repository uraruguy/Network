"use client";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const iconButtonVariants = cva(
  "pressable relative inline-grid shrink-0 place-items-center rounded-full select-none disabled:opacity-40 disabled:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /** Neutral translucent fill (iOS close / more buttons). */
        fill: "bg-fill-2 text-fg-2 hover:bg-fill-3 hover:text-fg",
        /** Floating glass over content or maps. */
        glass: "glass specular text-fg-2 hover:text-fg",
        /** Bare icon. */
        plain: "text-fg-3 hover:bg-fill-1 hover:text-fg",
        /** Accent icon (toolbar actions). */
        accent: "text-accent-text hover:bg-accent-soft",
        /** Solid accent (compose / add FAB). */
        primary: "bg-accent-fill text-accent-fg specular elevation-e2 hover:brightness-[1.05]",
        danger: "text-danger hover:bg-danger-soft",
      },
      size: {
        /** 30px visual, 44px hit area. */
        sm: "hit-44 h-[30px] w-[30px] [&_svg]:size-4",
        /** 36px visual, 44px hit area. */
        md: "hit-44 h-9 w-9 [&_svg]:size-[18px]",
        /** 44px. */
        lg: "h-11 w-11 [&_svg]:size-5",
      },
    },
    defaultVariants: { variant: "fill", size: "md" },
  },
);

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> &
  VariantProps<typeof iconButtonVariants> & {
    /** Required accessible name. Wrap in <Tooltip> for a visible hover label on desktop. */
    label: string;
    icon: ReactNode;
    /** Toggle state for toolbar toggles (`aria-pressed`). */
    pressed?: boolean;
  };

/** Icon-only button with an enforced accessible label and ≥44px hit target. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant, size, pressed, className, type = "button", title, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={title}
      aria-pressed={pressed}
      className={cn(iconButtonVariants({ variant, size }), pressed && "bg-accent-soft text-accent-text", className)}
      {...rest}
    >
      {icon}
    </button>
  );
});
