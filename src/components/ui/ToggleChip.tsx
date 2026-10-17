"use client";
import { Check } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { paletteVar } from "@/lib/constants/palette";
import { cn } from "@/lib/utils";

export type ToggleChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> & {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  /** Tint (stored hex snaps to the muted palette; CSS values used as-is). */
  color?: string;
  icon?: ReactNode;
  /** Show a check mark when pressed (multi-select filters). */
  showCheck?: boolean;
  size?: "sm" | "md";
};

/** Filter / multi-select chip with `aria-pressed`. 32px tall, ≥44px hit area. */
export const ToggleChip = forwardRef<HTMLButtonElement, ToggleChipProps>(function ToggleChip(
  { pressed, onPressedChange, color, icon, showCheck, size = "md", className, children, style, type = "button", ...rest },
  ref,
) {
  const tint = color ? (color.startsWith("#") ? paletteVar(color) : color) : undefined;
  return (
    <button
      ref={ref}
      type={type}
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        "pressable hit-44 inline-flex shrink-0 items-center gap-1.5 rounded-full font-medium whitespace-nowrap outline-offset-2 transition-[background-color,color,box-shadow] duration-150 [&_svg]:shrink-0",
        size === "sm" ? "h-7 px-2.5 text-caption [&_svg]:size-3" : "h-8 px-3 text-footnote [&_svg]:size-3.5",
        !tint && (pressed ? "bg-accent-fill text-accent-fg" : "bg-fill-2 text-fg-2 hover:bg-fill-3 hover:text-fg"),
        className,
      )}
      style={
        tint
          ? {
              background: pressed ? tint : `color-mix(in oklab, ${tint} 14%, transparent)`,
              color: pressed ? "white" : `color-mix(in oklab, ${tint} 62%, var(--fg))`,
              ...style,
            }
          : style
      }
      {...rest}
    >
      {showCheck && pressed ? <Check strokeWidth={3} /> : icon}
      {children}
    </button>
  );
});
