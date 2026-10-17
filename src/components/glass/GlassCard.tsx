import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

type Props = HTMLAttributes<HTMLDivElement> & {
  /** Floating glass (blurred, e3) instead of the default flat surface (e1). */
  strong?: boolean;
  interactive?: boolean;
  padded?: boolean;
};

/**
 * Card container. Defaults to `surface` (no backdrop-filter — cheap in long scrolling lists);
 * `strong` switches to `glass-thick` for cards floating over imagery/maps.
 */
export function GlassCard({ className, strong, interactive, padded = true, ...rest }: Props) {
  return (
    <div
      className={cn(
        strong ? "glass-thick specular" : "surface",
        "rounded-lg",
        padded && "p-4 sm:p-5",
        interactive && "pressable cursor-pointer hover:bg-surface-2",
        className,
      )}
      {...rest}
    />
  );
}
