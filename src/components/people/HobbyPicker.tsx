"use client";
import { AnimatePresence, motion } from "motion/react";
import { Chip } from "@/components/glass/Chip";
import { GlassInput } from "@/components/glass/GlassInput";
import { HOBBIES, type Hobby } from "@/lib/db/schema";
import { HOBBY_META } from "@/lib/utils";

type Props = { value: Hobby[]; other: string; onChange: (h: Hobby[]) => void; onOtherChange: (s: string) => void };

export function HobbyPicker({ value, other, onChange, onOtherChange }: Props) {
  const toggle = (h: Hobby) => onChange(value.includes(h) ? value.filter((x) => x !== h) : [...value, h]);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {HOBBIES.map((h) => (
          <button key={h} type="button" className="pressable" onClick={() => toggle(h)} aria-pressed={value.includes(h)}>
            <Chip active={value.includes(h)}>
              <span aria-hidden>{HOBBY_META[h]!.emoji}</span>
              {HOBBY_META[h]!.label}
            </Chip>
          </button>
        ))}
      </div>
      <AnimatePresence initial={false}>
        {value.includes("other") && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <GlassInput value={other} onChange={(e) => onOtherChange(e.target.value)} placeholder="Describe the other hobby…" autoFocus />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function HobbyChips({ hobbies, other, size = "sm" }: { hobbies: string[]; other?: string | null; size?: "sm" | "md" }) {
  if (!hobbies.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {hobbies.map((h) => (
        <Chip key={h} size={size}>
          <span aria-hidden>{HOBBY_META[h]?.emoji}</span>
          {h === "other" && other ? other : HOBBY_META[h]?.label ?? h}
        </Chip>
      ))}
    </div>
  );
}
