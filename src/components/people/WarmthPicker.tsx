"use client";
import { motion } from "motion/react";
import { useId } from "react";
import { WARMTH } from "@/lib/db/schema";
import type { Warmth } from "@/lib/db/schema";
import { cn, WARMTH_META } from "@/lib/utils";

export function WarmthPicker({ value, onChange }: { value: Warmth; onChange: (w: Warmth) => void }) {
  const id = useId();
  return (
    <div className="glass flex rounded-full p-1">
      {WARMTH.map((w) => {
        const active = w === value;
        return (
          <button
            key={w}
            type="button"
            onClick={() => onChange(w)}
            className={cn("pressable relative flex-1 rounded-full py-2 text-[13px] font-medium", active ? "text-fg" : "text-fg-3")}
          >
            {active && (
              <motion.span layoutId={`warmth-active-${id}`} className="absolute inset-0 rounded-full bg-white shadow-sm dark:bg-white/10" transition={{ type: "spring", stiffness: 500, damping: 40 }} />
            )}
            <span className="relative inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: WARMTH_META[w].color }} />
              {WARMTH_META[w].label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function WarmthDot({ warmth, className }: { warmth: Warmth; className?: string }) {
  return <span className={cn("inline-block h-2.5 w-2.5 rounded-full", className)} style={{ background: WARMTH_META[warmth].color }} title={WARMTH_META[warmth].label} />;
}
