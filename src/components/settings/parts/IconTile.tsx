import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** iOS Settings icon: a white glyph on a coloured rounded square. */
export function IconTile({ icon: Icon, color, size = 30, className }: { icon: LucideIcon; color: string; size?: 28 | 30 | 36; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center rounded-xs text-white shadow-[inset_0_0_0_0.5px_oklch(0_0_0/0.06)]", className)}
      style={{ background: color, width: size, height: size }}
    >
      <Icon size={size === 36 ? 21 : 18} strokeWidth={2.2} />
    </span>
  );
}
