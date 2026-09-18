import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

type Props = HTMLAttributes<HTMLSpanElement> & { color?: string; active?: boolean; size?: "sm" | "md" };

/** Category / filter chip. Pass a hex `color` to tint it. */
export function Chip({ className, color, active, size = "md", style, ...rest }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap transition-colors",
        size === "sm" ? "h-6 px-2.5 text-[12px]" : "h-8 px-3 text-[13px]",
        !color && (active ? "bg-accent text-accent-fg" : "bg-fg/6 text-fg-2"),
        className,
      )}
      style={
        color
          ? {
              background: active ? color : `color-mix(in oklab, ${color} 16%, transparent)`,
              color: active ? "#fff" : `color-mix(in oklab, ${color} 80%, var(--fg))`,
              ...style,
            }
          : style
      }
      {...rest}
    />
  );
}
