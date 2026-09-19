"use client";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Avatar } from "@/components/glass/Avatar";
import { Chip } from "@/components/glass/Chip";
import type { PersonListItem } from "@/lib/queries/types";
import { flag, formatRelative, HOBBY_META } from "@/lib/utils";
import { CategoryIcon } from "./CategoryIcon";
import { WarmthDot } from "./WarmthPicker";

export function PersonRow({ p }: { p: PersonListItem }) {
  const sub = [p.headline, p.company].filter(Boolean).join(" · ");
  return (
    <Link href={`/people/${p.id}`} className="pressable group flex items-center gap-3.5 rounded-[18px] px-3 py-2.5 hover:bg-white/50 dark:hover:bg-white/5">
      <Avatar name={p.displayName} src={p.avatarUrl} size={46} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[16px] font-semibold tracking-tight">{p.displayName}</span>
          <WarmthDot warmth={p.warmth} />
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 truncate text-[13.5px] text-fg-2">
          {p.homeLocation && (
            <span className="shrink-0">
              {flag(p.homeLocation.countryCode)} {p.homeLocation.name}
            </span>
          )}
          {p.homeLocation && sub && <span className="text-fg-4">·</span>}
          <span className="truncate">{sub}</span>
        </div>
        {(p.categories.length > 0 || p.hobbies.length > 0) && (
          <div className="mt-1.5 flex items-center gap-1.5 overflow-hidden">
            {p.categories.slice(0, 3).map((c) => (
              <Chip key={c.id} color={c.color} size="sm">
                <CategoryIcon name={c.icon} size={11} />
                {c.name}
              </Chip>
            ))}
            {p.hobbies.length > 0 && (
              <span className="ml-0.5 text-[13px] tracking-tight" title={p.hobbies.map((h) => HOBBY_META[h]?.label ?? h).join(", ")}>
                {p.hobbies.slice(0, 4).map((h) => HOBBY_META[h]?.emoji ?? "").join("")}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-[12px] text-fg-3">
        <span>{formatRelative(p.lastInteractionAt ?? p.createdAt)}</span>
        <ChevronRight size={16} className="text-fg-4 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}
