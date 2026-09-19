"use client";
import { AnimatePresence, motion } from "motion/react";
import { MapPin, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { GlassInput } from "@/components/glass/GlassInput";
import { cityToLocation, useCitySearch } from "@/lib/queries/misc";
import type { LocationInput } from "@/lib/schemas";
import { cn, flag } from "@/lib/utils";

type Props = {
  value: LocationInput | null;
  onChange: (v: LocationInput | null) => void;
  placeholder?: string;
  autoFocus?: boolean;
};

export function CityPicker({ value, onChange, placeholder = "City", autoFocus }: Props) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const { data: results = [] } = useCitySearch(q);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (value) {
    return (
      <div className="glass flex h-12 items-center gap-2 rounded-[var(--r-md)] pl-4 pr-2 text-[16px]">
        <MapPin size={16} className="text-accent-strong shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          {flag(value.countryCode)} {value.name}
          <span className="text-fg-3">{value.admin && value.admin !== value.name ? `, ${value.admin}` : ""}, {value.country}</span>
        </span>
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
        autoFocus={autoFocus}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setHi(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!results.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, results.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          if (e.key === "Enter" || e.key === "Return" || e.keyCode === 13) { e.preventDefault(); onChange(cityToLocation(results[hi]!)); setQ(""); setOpen(false); }
        }}
      />
      <AnimatePresence>
        {open && results.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="glass-strong specular absolute left-0 right-0 top-[calc(100%+6px)] z-40 max-h-72 overflow-auto rounded-[var(--r-md)] p-1.5"
          >
            {results.map((c, i) => (
              <li key={c.id}>
                <button
                  type="button"
                  onMouseEnter={() => setHi(i)}
                  onClick={() => { onChange(cityToLocation(c)); setQ(""); setOpen(false); }}
                  className={cn("flex w-full items-center gap-3 rounded-[12px] px-3 py-2 text-left text-[15px]", i === hi ? "bg-accent-soft" : "")}
                >
                  <span className="text-lg leading-none">{flag(c.countryCode)}</span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-fg-3">{c.admin && c.admin !== c.name ? ` · ${c.admin}` : ""} · {c.country}</span>
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
