import { paletteVar } from "@/lib/constants/palette";
import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

type Props = HTMLAttributes<HTMLSpanElement> & {
  /**
   * Tint colour. Stored hex colours (categories) snap to the nearest muted palette hue so
   * nothing is over-saturated and dark mode gets its own variant; CSS values (`var(--…)`,
   * `oklch(…)`) are used as-is. Pass `raw` to use a hex verbatim.
   */
  color?: string;
  raw?: boolean;
  active?: boolean;
  size?: "sm" | "md";
};

/** Category / filter chip (display only — wrap in a button or use `ToggleChip` for toggles). */
export function Chip({ className, color, raw, active, size = "md", style, ...rest }: Props) {
  const tint = color && !raw && color.startsWith("#") ? paletteVar(color) : color;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap transition-colors duration-150",
        size === "sm" ? "h-6 px-2.5 text-caption" : "h-8 px-3 text-footnote",
        !tint && (active ? "bg-accent-fill text-accent-fg" : "bg-fill-2 text-fg-2"),
        className,
      )}
      style={
        tint
          ? {
              background: active ? tint : `color-mix(in oklab, ${tint} 16%, transparent)`,
              color: active ? "white" : `color-mix(in oklab, ${tint} 62%, var(--fg))`,
              ...style,
            }
          : style
      }
      {...rest}
    />
  );
}
