"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Globe2, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Globe ⇄ Graph toggle shown on both map views. */
export function ViewSwitch({ trailing }: { trailing?: React.ReactNode }) {
  const pathname = usePathname();
  const items = [
    { href: "/globe", icon: Globe2, label: "Globe" },
    { href: "/graph", icon: Share2, label: "Graph" },
  ];
  return (
    <div className="pointer-events-auto flex items-center gap-2">
      <div className="glass specular flex rounded-full p-1">
        {items.map((it) => {
          const active = pathname.startsWith(it.href);
          return (
            <Link key={it.href} href={it.href} className={cn("pressable flex h-9 items-center gap-1.5 rounded-full px-3 text-[13.5px] font-medium", active ? "bg-accent text-accent-fg" : "text-fg-2")} aria-current={active ? "page" : undefined}>
              <it.icon size={15} /> <span className="hidden sm:inline">{it.label}</span>
            </Link>
          );
        })}
      </div>
      {trailing}
    </div>
  );
}
