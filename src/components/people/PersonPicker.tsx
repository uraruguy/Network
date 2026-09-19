"use client";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/glass/Avatar";
import { GlassInput } from "@/components/glass/GlassInput";
import { usePeople } from "@/lib/queries/people";
import { cn } from "@/lib/utils";

type Pick = { id: string; displayName: string; avatarUrl?: string | null };
type Props = { value: Pick | null; onChange: (p: Pick | null) => void; placeholder?: string; exclude?: string[] };

export function PersonPicker({ value, onChange, placeholder = "Search people…", exclude = [] }: Props) {
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const { data = [] } = usePeople({ q: dq || undefined });
  const results = data.filter((p) => !exclude.includes(p.id)).slice(0, 8);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (value) {
    return (
      <div className="glass flex h-12 items-center gap-2.5 rounded-[var(--r-md)] pl-2 pr-2 text-[16px]">
        <Avatar name={value.displayName} src={value.avatarUrl} size={30} />
        <span className="min-w-0 flex-1 truncate">{value.displayName}</span>
        <button type="button" onClick={() => onChange(null)} aria-label="Clear" className="pressable grid h-8 w-8 place-items-center rounded-full text-fg-3 hover:bg-fg/6">
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <GlassInput
        value={q}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!results.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, results.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          if (e.key === "Enter" || e.key === "Return" || e.keyCode === 13) { e.preventDefault(); const r = results[hi]!; onChange({ id: r.id, displayName: r.displayName, avatarUrl: r.avatarUrl }); setQ(""); setOpen(false); }
        }}
      />
      <AnimatePresence>
        {open && results.length > 0 && (
          <motion.ul initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}
            className="glass-strong specular absolute left-0 right-0 top-[calc(100%+6px)] z-40 max-h-72 overflow-auto rounded-[var(--r-md)] p-1.5">
            {results.map((p, i) => (
              <li key={p.id}>
                <button type="button" onMouseEnter={() => setHi(i)}
                  onClick={() => { onChange({ id: p.id, displayName: p.displayName, avatarUrl: p.avatarUrl }); setQ(""); setOpen(false); }}
                  className={cn("flex w-full items-center gap-3 rounded-[12px] px-2 py-1.5 text-left text-[15px]", i === hi && "bg-accent-soft")}>
                  <Avatar name={p.displayName} src={p.avatarUrl} size={30} />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{p.displayName}</span>
                    {(p.headline || p.company) && <span className="text-fg-3"> · {[p.headline, p.company].filter(Boolean).join(", ")}</span>}
                  </span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
