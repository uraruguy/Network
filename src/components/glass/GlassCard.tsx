import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

type Props = HTMLAttributes<HTMLDivElement> & {
  strong?: boolean;
  interactive?: boolean;
  padded?: boolean;
};

export function GlassCard({ className, strong, interactive, padded = true, ...rest }: Props) {
  return (
    <div
      className={cn(
        strong ? "glass-strong" : "glass",
        "specular rounded-[var(--r-lg)]",
        padded && "p-4 sm:p-5",
        interactive && "pressable cursor-pointer hover:shadow-[var(--glass-shadow-lg)]",
        className,
      )}
      {...rest}
    />
  );
}
